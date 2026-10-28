#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为各展厅的液晶屏预抽一张视频封面帧，输出到 assets/posters/{展厅id}.jpg。

为什么需要预抽：
    原先液晶屏靠运行时用 <video> 解码并 seek 取帧（museum.js 的 doCapture）。
    视频单个 180~420MB，浏览器需要先缓冲、再定位，慢且不稳定；
    失败时屏幕只剩「点击播放」占位图，看起来像没内容。
    预抽成静态 JPG 后，屏幕一进场就有真实画面，且能被 embed.js 内嵌，
    双击 index.html（file://）同样可见。

取帧位置：在 6 个候选时间点各取一帧，按平均亮度自动挑最亮的一帧
（片头常有黑场淡入，固定取 1.5 秒会拿到近乎全黑的画面）。

依赖：imageio-ffmpeg（自带 ffmpeg 可执行文件）
    python -m pip install imageio-ffmpeg

用法（项目根目录）：
    python tools/make_posters.py
"""
import io
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_DIR = os.path.join(ROOT, 'videos')
POSTER_DIR = os.path.join(ROOT, 'assets', 'posters')
ZONE_IDS = ['jgs', 'yanan', 'xbp', 'hqq', 'xsd']
MAX_W = 1280
# 候选时间点（占全片比例）；太靠后容易取到片尾字幕/黑场，故止于 45%
RATIOS = [0.06, 0.12, 0.18, 0.25, 0.33, 0.45]

try:
    from PIL import Image
except Exception:  # noqa: BLE001
    Image = None


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        sys.exit('缺少 imageio-ffmpeg，请先执行：python -m pip install imageio-ffmpeg')


def duration_of(ff, path):
    """从 ffmpeg -i 的 stderr 里读时长（秒）。"""
    p = subprocess.run([ff, '-hide_banner', '-i', path],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    txt = p.stderr.decode('utf-8', 'ignore')
    m = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.?\d*)', txt)
    if not m:
        return 0.0
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def grab(ff, src, dst, t):
    cmd = [
        ff, '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', '%.2f' % t, '-i', src,
        '-frames:v', '1',
        '-vf', 'scale=%d:-2' % MAX_W,
        '-q:v', '3',
        dst,
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        return False, p.stderr.decode('utf-8', 'ignore')[:300]
    return True, ''


def brightness(path):
    """平均亮度 + 标准差；用于排除黑场/纯色帧。"""
    if Image is None:
        return 128.0, 40.0
    im = Image.open(path).convert('L')
    im = im.resize((64, 36))
    px = list(im.getdata())
    mean = sum(px) / float(len(px))
    var = sum((p - mean) ** 2 for p in px) / float(len(px))
    return mean, var ** 0.5


def main():
    ff = ffmpeg_exe()
    os.makedirs(POSTER_DIR, exist_ok=True)
    ok = 0
    for zid in ZONE_IDS:
        src = os.path.join(VIDEO_DIR, zid + '.mp4')
        if not os.path.exists(src):
            print('  跳过 %-6s 找不到 %s' % (zid, os.path.relpath(src, ROOT)))
            continue
        dur = duration_of(ff, src)
        if dur <= 0:
            print('  %-6s 读不到时长，跳过' % zid)
            continue
        dst = os.path.join(POSTER_DIR, zid + '.jpg')
        best = None  # (score, t, tmpfile)
        tmpdir = tempfile.mkdtemp(prefix='poster_')
        try:
            for r in RATIOS:
                t = dur * r
                tmp = os.path.join(tmpdir, 'f.jpg')
                good, _err = grab(ff, src, tmp, t)
                if not good or not os.path.exists(tmp):
                    continue
                mean, sd = brightness(tmp)
                # 打分：先排除死黑/过曝，再优先画面细节（标准差高 = 有内容、非纯色/雾面）
                # 亮度落在 [45,190] 视为可用；不在此区间按偏离程度扣分
                penalty = 0
                if mean < 45:
                    penalty = (45 - mean) * 3
                elif mean > 190:
                    penalty = (mean - 190) * 3
                score = sd * 2 - penalty
                if best is None or score > best[0]:
                    best = (score, t, open(tmp, 'rb').read(), mean, sd)
            if best is None:
                print('  %-6s 所有候选帧都取失败' % zid)
                continue
            with open(dst, 'wb') as f:
                f.write(best[2])
            kb = os.path.getsize(dst) / 1024.0
            print('  %-6s 选 %.1fs（亮度 %.0f / 细节 %.0f）-> %-22s %7.1f KB'
                  % (zid, best[1], best[3], best[4], os.path.relpath(dst, ROOT), kb))
            ok += 1
        finally:
            for f in os.listdir(tmpdir):
                try:
                    os.remove(os.path.join(tmpdir, f))
                except OSError:
                    pass
            try:
                os.rmdir(tmpdir)
            except OSError:
                pass
    print('完成：%d/%d 张封面帧' % (ok, len(ZONE_IDS)))


if __name__ == '__main__':
    main()
