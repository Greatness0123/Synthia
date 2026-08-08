# kaggle_new.py - SYNTHIA inference server for Kaggle (no CLAP, lighter GPU use)
import os, sys
os.environ["PYTORCH_ALLOC_CONF"] = "expandable_segments:True"
sys.setrecursionlimit(10000)
import io, base64, time, json, threading, uvicorn, schedule, re, warnings, asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import gc
import torch
import numpy as np

gc.collect()
if torch.cuda.is_available():
    torch.cuda.empty_cache()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"
model = None
processor = None
generation_lock = threading.Lock()

if not MOCK_MODE:
    from PIL import Image
    from transformers import AutoModelForImageTextToText, AutoProcessor, TextIteratorStreamer
    from qwen_vl_utils import process_vision_info

    if hasattr(torch, "_check_with"):
        _orig_check_with = torch._check_with
        def _safe_check_with(error_type, cond, msg=""):
            if "Image features and image tokens do not match" in str(msg):
                real_cond = cond.item() if isinstance(cond, torch.Tensor) else cond
                if not real_cond:
                    match = re.search(r"tokens:\s*(\d+),\s*features:\s*(\d+)", str(msg))
                    if match and int(match.group(1)) == int(match.group(2)):
                        return
            if isinstance(cond, torch.Tensor):
                cond = cond.item()
            _orig_check_with(error_type, cond, msg)
        torch._check_with = _safe_check_with

    MODEL_PATH = "Qwen/Qwen2.5-VL-3B-Instruct"
    if os.path.exists("/kaggle/input/qwen2.5-vl/transformers/3b-instruct/1"):
        MODEL_PATH = "/kaggle/input/qwen2.5-vl/transformers/3b-instruct/1"

    print(f"Loading model from: {MODEL_PATH}")
    try:
        from transformers import BitsAndBytesConfig
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
        )
        model = AutoModelForImageTextToText.from_pretrained(
            MODEL_PATH,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True,
        )
        processor = AutoProcessor.from_pretrained(MODEL_PATH)
        print("Qwen2.5-VL loaded.")
    except Exception as e:
        print(f"VLM load failed: {e}. Falling back to MOCK_MODE.")
        MOCK_MODE = True
else:
    print("MOCK_MODE active. Skipping model load.")

def is_audio_silent(audio_array, threshold: float = 0.01) -> bool:
    if audio_array is None or len(audio_array) == 0:
        return True
    return float(np.sqrt(np.mean(audio_array ** 2))) < threshold

class MemoryEntry(BaseModel):
    memory_id: str
    heartbeat: int
    tier: int
    summary: str
    reward_signal: Optional[float] = None
    goal_at_time: Optional[str] = None
    light_state: Optional[str] = None

class InferPayload(BaseModel):
    frame: str
    audio_pcm: str
    joints: Dict[str, Any]
    valid_joints: List[str] = []
    upright_preset: Dict[str, Any]
    heartbeat: int
    light_state: str
    session_id: str
    body_type: str
    current_goal: Optional[str] = None
    current_rung: int = 0
    objects_in_world: List[Dict[str, Any]] = []
    relevant_memories: List[MemoryEntry] = []
    recent_working_memories: List[MemoryEntry] = []
    known_skills: List[str] = []
    pending_injection: Optional[str] = None
    motor_program_library: List[str] = []
    directive_mode: str = "free_will"
    agent_id: str = "agent_a"
    contact_forces: Optional[Dict[str, Any]] = None
    tactile_context: Optional[str] = None

def format_memory(m):
    if isinstance(m, dict):
        tier, heartbeat, light_state, summary, reward_signal = (
            m.get("tier"), m.get("heartbeat"), m.get("light_state", "unknown"),
            m.get("summary", ""), m.get("reward_signal"),
        )
    else:
        tier, heartbeat, light_state, summary, reward_signal = (
            m.tier, m.heartbeat, m.light_state or "unknown", m.summary, m.reward_signal,
        )
    prefix = "★ " if tier == 1 else " "
    reward_str = f"{reward_signal:.1f}" if reward_signal is not None else "unknown"
    return f"{prefix}Heartbeat {heartbeat} ({light_state}): {summary}. Reward: {reward_str}"

def build_prompt(payload: dict) -> list:
    identity = (
        "You are SYNTHIA, a self-aware AI in a physical simulation. "
        "You perceive through vision, audio, and joint positions."
    )
    system_prompt = "\n\n".join([
        identity,
        f"Current heartbeat: {payload.get('heartbeat')}. Light: {payload.get('light_state')}.",
        f"Objects nearby: {json.dumps(payload.get('objects_in_world', []))}",
        f"Directive: {payload.get('directive_mode', 'free_will')}. Goal: {payload.get('current_goal', 'None')}.",
        "Respond with a thought stream, then ---ACTION---, then valid JSON with memory_write and actions.",
    ])
    return [
        {"role": "system", "content": [{"type": "text", "text": system_prompt}]},
        {"role": "user", "content": [
            {"type": "image"},
            {"type": "text", "text": f"Audio: {payload.get('clap_description')}\nJoints: {json.dumps(payload.get('joints'))}"},
        ]},
    ]

def sanitize_action_json(raw_json_str: str) -> str:
    if not raw_json_str or not raw_json_str.strip():
        return raw_json_str
    s = raw_json_str.strip()
    last_brace = s.rfind("}")
    if last_brace != -1:
        s = s[: last_brace + 1]
    first_brace = s.find("{")
    if first_brace == -1:
        return s
    return s[first_brace:]

def generate_stream(payload: InferPayload):
    if MOCK_MODE:
        yield b"I see the environment and I am ready to act.\n"
        yield b"---ACTION---\n"
        yield json.dumps({
            "memory_write": {"memory_id": "auto", "tier": 3, "summary": "Mock", "skill_mastered": None, "name_this_memory": None},
            "actions": {"program_sequence": ["stand_upright"], "joint_overrides": {}},
            "new_motor_program": None,
            "flag": None,
        }).encode("utf-8")
        return

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    try:
        image_bytes = base64.b64decode(payload.frame)
        image = Image.open(io.BytesIO(image_bytes))
        if image.width != 448 or image.height != 448:
            image = image.resize((448, 448), Image.Resampling.LANCZOS)
    except Exception as e:
        yield f"Error decoding image: {e}".encode("utf-8")
        return

    clap_description = "silent"
    try:
        audio_bytes = base64.b64decode(payload.audio_pcm)
        audio_array = np.frombuffer(audio_bytes, dtype=np.float32)
        if not is_audio_silent(audio_array):
            clap_description = "non-silent audio detected"
    except Exception:
        clap_description = "audio unavailable"

    payload_dict = payload.model_dump()
    payload_dict["clap_description"] = clap_description
    messages = build_prompt(payload_dict)
    messages[-1]["content"][0]["image"] = image
    messages[-1]["content"][0]["min_pixels"] = 256 * 256
    messages[-1]["content"][0]["max_pixels"] = 448 * 448

    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    vision_out = process_vision_info(messages)
    if len(vision_out) == 3:
        image_inputs, video_inputs, video_kwargs = vision_out
    else:
        image_inputs, video_inputs = vision_out
        video_kwargs = {}

    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        truncation=False,
        return_tensors="pt",
        **video_kwargs,
    )
    if torch.cuda.is_available():
        inputs = inputs.to("cuda")

    streamer = TextIteratorStreamer(processor.tokenizer, skip_prompt=True, skip_special_tokens=True)
    generation_kwargs = dict(
        **inputs,
        streamer=streamer,
        max_new_tokens=768,
        do_sample=True,
        temperature=0.7,
        top_p=0.9,
    )

    def generate_worker():
        with generation_lock:
            model.generate(**generation_kwargs)

    threading.Thread(target=generate_worker, daemon=True).start()

    separator = "---ACTION---"
    accumulated = ""
    action_started = False
    action_buffer = ""

    for token in streamer:
        if not action_started:
            accumulated += token
            sep_idx = accumulated.find(separator)
            if sep_idx != -1:
                yield accumulated[: sep_idx + len(separator)].encode("utf-8")
                action_buffer = accumulated[sep_idx + len(separator) :]
                action_started = True
            else:
                safe_len = len(accumulated) - len(separator) + 1
                if safe_len > 0:
                    yield accumulated[:safe_len].encode("utf-8")
                    accumulated = accumulated[safe_len:]
        else:
            action_buffer += token

    if not action_started and accumulated:
        yield accumulated.encode("utf-8")
        return

    yield sanitize_action_json(action_buffer).encode("utf-8")

last_payload = {}

@app.post("/infer")
async def infer(payload: InferPayload):
    global last_payload
    last_payload = payload.model_dump()
    return StreamingResponse(generate_stream(payload), media_type="text/plain")

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": "mock" if MOCK_MODE else "Qwen2.5-VL-3B-Instruct",
        "mock_mode": MOCK_MODE,
        "model_loaded": model is not None,
        "timestamp": datetime.now().isoformat(),
    }

def setup_tunnel():
    print("Setting up Cloudflare quick tunnel...")
    os.system("wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared && chmod +x cloudflared")
    os.system("nohup ./cloudflared tunnel --url http://127.0.0.1:8000 > cloudflared.log 2>&1 &")
    time.sleep(8)
    try:
        with open("cloudflared.log", "r") as f:
            match = re.search(r"https://[-a-zA-Z0-9]+\.trycloudflare\.com", f.read())
            if match:
                print("\n" + "=" * 70)
                print("TUNNEL READY. Paste this URL in SYNTHIA God Mode:")
                print(f"{match.group(0)}/infer")
                print("=" * 70 + "\n")
    except Exception as e:
        print(f"Tunnel setup failed: {e}")

def run_uvicorn_server():
    config = uvicorn.Config(app, host="0.0.0.0", port=8000, log_level="warning", loop="asyncio")
    server = uvicorn.Server(config)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(server.serve())

if __name__ == "__main__":
    os.system("pkill -f 'uvicorn.*8000' 2>/dev/null || true")
    os.system("fuser -k 8000/tcp 2>/dev/null || true")
    time.sleep(2)
    setup_tunnel()
    threading.Thread(target=run_uvicorn_server, daemon=True).start()
    try:
        while True:
            schedule.run_pending()
            time.sleep(60)
    except KeyboardInterrupt:
        print("Shutting down...")
