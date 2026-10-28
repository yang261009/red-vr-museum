"""生成展馆背景纯音乐：中国风五声音阶氛围曲，约 58 秒无缝循环。"""
import numpy as np
import wave

SR = 22050
BPM = 66.0
BEAT = 60.0 / BPM            # 0.909s
BAR = BEAT * 4               # 3.636s
BARS = 16
TOTAL = int(BAR * BARS * SR)
N = np.arange(TOTAL) / SR

F = {
    'A2': 110.00, 'F2': 87.31, 'C3': 130.81, 'G2': 98.00, 'E2': 82.41,
    'A3': 220.00, 'F3': 174.61, 'C4': 261.63, 'G3': 196.00, 'E3': 164.81,
    'A4': 440.00, 'C5': 523.25, 'D5': 587.33, 'E5': 659.26, 'G4': 392.00,
    'G5': 783.99, 'A5': 880.00, 'E4': 329.63, 'D4': 293.66, 'C6': 1046.5,
}

PROG = ['Am', 'F', 'C', 'G'] * 4
CHORD = {
    'Am': ['A2', 'A3', 'C4', 'E3'],
    'F':  ['F2', 'F3', 'A3', 'C4'],
    'C':  ['C3', 'G3', 'C4', 'E3'],
    'G':  ['G2', 'G3', 'B3', 'D4'],
}
CHORD['G'][2] = 'G3'; CHORD['G'][3] = 'D4'  # 避免B3(非五声)过亮
CHORD['F'][2] = 'A3'; CHORD['F'][3] = 'C4'

# 旋律（每小节 8 个八分音符，None=延续/休止）
MEL = [
    ['A4', 'C5', 'D5', 'E5', None, 'E5', 'D5', 'C5'],
    ['A4', None, 'G4', 'A4', 'C5', None, 'A4', 'G4'],
    ['E5', None, 'D5', 'C5', 'D5', 'E5', 'G5', None],
    ['D5', 'C5', 'A4', None, 'G4', 'A4', None, None],
    ['A4', 'C5', 'D5', 'E5', 'G5', None, 'E5', 'D5'],
    ['C5', None, 'A4', 'C5', 'D5', None, 'C5', 'A4'],
    ['E5', 'G5', 'A5', None, 'G5', 'E5', 'D5', 'C5'],
    ['D5', None, 'A4', None, None, None, None, None],
    ['A4', 'C5', 'D5', 'E5', None, 'E5', 'D5', 'C5'],
    ['A4', None, 'G4', 'A4', 'C5', None, 'D5', 'E5'],
    ['G5', None, 'E5', 'D5', 'C5', None, 'D5', 'E5'],
    ['D5', 'C5', 'A4', 'G4', 'A4', None, None, None],
    ['E5', None, 'D5', 'C5', 'A4', None, 'C5', 'D5'],
    ['C5', None, 'A4', 'G4', 'A4', None, None, None],
    ['A4', 'C5', 'D5', 'E5', 'G5', 'A5', None, None],
    ['A5', None, None, None, None, None, None, None],
]

def pluck(freq, dur, amp):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.exp(-t * 2.6) * (1 - np.exp(-t * 400))
    w = (np.sin(2 * np.pi * freq * t) +
         0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 5) +
         0.12 * np.sin(2 * np.pi * freq * 3 * t) * np.exp(-t * 8))
    return w * env * amp

def pad(freq, dur, amp):
    n = int(dur * SR)
    t = np.arange(n) / SR
    a, r = 0.9, 0.9
    env = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    env[:na] = np.linspace(0, 1, na) ** 2
    env[-nr:] *= np.linspace(1, 0, nr) ** 2
    w = (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2.001 * t)) / 1.3
    return w * env * amp

buf = np.zeros(TOTAL)

# 低音 + 和弦垫
for bar in range(BARS):
    ch = CHORD[PROG[bar]]
    start = int(bar * BAR * SR)
    dur = BAR * 1.02
    n = min(int(dur * SR), TOTAL - start)
    buf[start:start + n] += pad(F[ch[0]], dur, 0.20)[:n]
    for name in ch[1:]:
        buf[start:start + n] += pad(F[name], dur, 0.055)[:n]

# 旋律
step = BEAT / 2
for bar in range(BARS):
    for i, name in enumerate(MEL[bar]):
        if name is None:
            continue
        start = int((bar * BAR + i * step) * SR)
        w = pluck(F[name], step * 2.6, 0.24)
        end = min(start + len(w), TOTAL)
        buf[start:end] += w[:end - start]

# 简易延迟混响
d1, d2 = int(0.155 * SR), int(0.31 * SR)
echo = buf.copy()
echo[d1:] += 0.34 * buf[:-d1]
echo[d2:] += 0.17 * buf[:-d2]
buf = echo

# 首尾交叉淡化实现无缝循环
fade = int(0.8 * SR)
ramp = np.linspace(0, 1, fade)
buf[:fade] *= ramp
buf[-fade:] *= ramp[::-1]

buf /= np.max(np.abs(buf)) + 1e-9
pcm = (buf * 32767 * 0.85).astype(np.int16)

with wave.open('music/bgm.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

print('bgm.wav written:', len(pcm) / SR, 'seconds')
