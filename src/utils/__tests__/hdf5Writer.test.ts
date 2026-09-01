import { writeHDF5, formatMemoriesToHDF5 } from '../hdf5Writer';

describe('HDF5 Dataset Writer (RoboMimic / ACT / Diffusion Policy)', () => {
  test('writeHDF5 creates a valid byte buffer from raw episodes', () => {
    const rawEpisodes = [
      {
        episodeId: 'demo_0',
        steps: [
          {
            heartbeat: 0,
            timestamp: 0,
            jointPositions: [0, 10, 20],
            actions: [0, 5, 10],
            reward: 1,
            done: false,
          },
        ],
      },
    ];
    const bytes = writeHDF5(rawEpisodes);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x48); // 'H'
  });

  test('generates valid HDF5 binary container with magic header and manifest', () => {
    const mockMemories = [
      {
        session_id: 'session_alpha',
        heartbeat: 0,
        joint_states: [0, 10, 20, 30],
        action_taken: [0, 5, 10, 15],
        reward_signal: 1.0,
        outcome: 'success',
        thought: 'Stabilize right leg',
        goal_at_time: 'Walk forward',
      },
      {
        session_id: 'session_alpha',
        heartbeat: 1,
        joint_states: [5, 15, 25, 35],
        action_taken: [5, 10, 15, 20],
        reward_signal: 1.2,
        outcome: 'success',
        thought: 'Swing left leg forward',
        goal_at_time: 'Walk forward',
      },
    ];

    const bytes = formatMemoriesToHDF5(mockMemories);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(12);

    // Verify HDF5 Magic Header: \x89HDF\r\n\x1a\n
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x48); // 'H'
    expect(bytes[2]).toBe(0x44); // 'D'
    expect(bytes[3]).toBe(0x46); // 'F'
    expect(bytes[4]).toBe(0x0d); // '\r'
    expect(bytes[5]).toBe(0x0a); // '\n'
    expect(bytes[6]).toBe(0x1a); // SUB
    expect(bytes[7]).toBe(0x0a); // '\n'

    // Verify Manifest payload
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const manifestLen = view.getUint32(8, true);
    expect(manifestLen).toBeGreaterThan(0);

    const manifestText = new TextDecoder().decode(bytes.subarray(12, 12 + manifestLen));
    const parsed = JSON.parse(manifestText);

    expect(parsed.format).toBe('HDF5');
    expect(parsed.license).toBe('Apache-2.0');
    expect(parsed.env_name).toBe('Synthia-Humanoid-v1');
    expect(parsed.total_samples).toBe(2);
    expect(parsed.data.demo_0).toBeDefined();
    expect(parsed.data.demo_0.obs.joint_positions.length).toBe(2);
    expect(parsed.data.demo_0.actions.length).toBe(2);
  });
});
