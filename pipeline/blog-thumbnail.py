# pipeline/blog-thumbnail.py
# 시리즈 그리드 이미지 + 고정 템플릿(assets/blog-thumb-template.png) + 제목 텍스트를
# 합성해서 네이버 블로그 "대표 이미지(썸네일)"용 300x300 PNG를 만든다.
#
# 사용법: python pipeline/blog-thumbnail.py <슬러그> "<제목>"
#   예:   python pipeline/blog-thumbnail.py nokdu-flower "녹두꽃"
#
# 결과물은 out/blog-thumbnails/<슬러그>.png 에 저장됨.
# 이 파일을 네이버 블로그 글쓰기에서 "사진" 버튼으로 직접 업로드하고
# 대표 이미지로 지정하면 됨(외부 링크 이미지는 대표 이미지 지정이 안 되므로
# 반드시 이렇게 파일로 업로드해야 함).

import sys
import os
import urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE_PATH = os.path.join(ROOT, 'assets', 'blog-thumb-template.png')
OUT_DIR = os.path.join(ROOT, 'out', 'blog-thumbnails')
FONT_PATH = r'C:\Windows\Fonts\malgunbd.ttf'
CLOUD = 'dhfobwnfc'

# 템플릿(300x300) 내 좌표: 위쪽은 투명(그리드 이미지가 비쳐 보이는 자리),
# 아래쪽 노란 바가 제목 텍스트 자리.
BAR = (9, 261, 289, 291)  # x0, y0, x1, y1


def grid_image_url(slug):
    return (
        f'https://res.cloudinary.com/{CLOUD}/image/upload/'
        f'f_auto,q_auto/w_900,c_limit/uncledison/coloring/{slug}/{slug}-grid'
    )


def make_thumbnail(slug, title):
    os.makedirs(OUT_DIR, exist_ok=True)
    template = Image.open(TEMPLATE_PATH).convert('RGBA')
    w, h = template.size

    grid_path = os.path.join(OUT_DIR, f'_{slug}_grid_src.jpg')
    urllib.request.urlretrieve(grid_image_url(slug), grid_path)
    grid = Image.open(grid_path).convert('RGBA')
    gw, gh = grid.size
    grid = grid.resize((w, round(w * gh / gw)), Image.LANCZOS)
    os.remove(grid_path)

    canvas = Image.new('RGBA', (w, h), (255, 255, 255, 255))
    canvas.paste(grid, (0, 0))
    canvas = Image.alpha_composite(canvas, template)

    draw = ImageDraw.Draw(canvas)
    bar_x0, bar_y0, bar_x1, bar_y1 = BAR
    bar_w, bar_h = bar_x1 - bar_x0, bar_y1 - bar_y0

    size = 26
    font = ImageFont.truetype(FONT_PATH, size)
    while size > 10:
        font = ImageFont.truetype(FONT_PATH, size)
        bbox = draw.textbbox((0, 0), title, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        if tw <= bar_w - 12 and th <= bar_h + 6:
            break
        size -= 1

    bbox = draw.textbbox((0, 0), title, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = bar_x0 + (bar_w - tw) / 2 - bbox[0]
    ty = bar_y0 + (bar_h - th) / 2 - bbox[1]
    draw.text((tx, ty), title, font=font, fill=(20, 20, 20, 255))

    out_path = os.path.join(OUT_DIR, f'{slug}.png')
    canvas.save(out_path)
    return out_path


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('사용법: python pipeline/blog-thumbnail.py <슬러그> "<제목>"')
        sys.exit(1)
    slug, title = sys.argv[1], sys.argv[2]
    path = make_thumbnail(slug, title)
    print(f'저장됨: {path}')
