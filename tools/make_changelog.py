"""Fills the changelog email: python tools/make_changelog.py emails/changelogs/2026-10-31.json

Writes the entry's .html and .txt beside it, ready to send as a Resend broadcast. Resend fills in the unsubscribe
link, and only in a broadcast. The title and the pictures load from GitHub, so they have to be pushed first.
It also writes content/news.json from the newest entries, which is the What's New page in the game. With no entry it does only that.
Standard library only.
"""
import datetime
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "emails" / "changelog.html"
ENTRIES = ROOT / "emails" / "changelogs"
NEWS = ROOT / "content" / "news.json"
NEWS_KEPT = 5
REPO = "https://github.com/Prasad-P2005/Agent-isekai"
RAW = "https://raw.githubusercontent.com/Prasad-P2005/Agent-isekai/main/"
# The ribbons of the interface: (label, ribbon, ink on it)
KINDS = {
    "new": ("NEW", "#c02c42", "#fff1df"),
    "changed": ("CHANGED", "#1484dc", "#fff1df"),
    "fixed": ("FIXED", "#2e9150", "#fff1df"),
    "check": ("STILL TO CHECK", "#f7a51d", "#3f2029"),
}


def block(source, name):
    """Splits out the part between <!--name--> and <!--/name-->."""
    match = re.search(rf"<!--{name}-->\n(.*?)<!--/{name}-->\n", source, re.S)
    return match.group(1), match.group(0)


def fill(source, **values):
    for key, value in values.items():
        source = source.replace("{{" + key + "}}", value)
    return source


def render(entry):
    page = TEMPLATE.read_text(encoding="utf-8")
    item, item_whole = block(page, "item")
    section, section_whole = block(page.replace(item_whole, "{{items}}"), "section")
    picture, picture_whole = block(page, "picture")
    sections = ""
    for s in entry["sections"]:
        label, color, ink = KINDS[s["kind"]]
        items = "".join(fill(item, head=html.escape(i["head"]), text=html.escape(i["text"])) for i in s["items"])
        sections += fill(section, label=label, color=color, ink=ink).replace("{{items}}", items)
    pictures = "".join(fill(picture, link=RAW + p["file"], image=RAW + p["file"], caption=html.escape(p["caption"])) for p in entry["pictures"])
    page = page.replace(section_whole.replace("{{items}}", item_whole), sections).replace(picture_whole, pictures)
    return fill(page, subject=html.escape(entry["subject"]), date=entry["date"], build=entry["build"], summary=html.escape(entry["summary"]), repo=REPO, title=RAW + "emails/title.png")


def plain(entry):
    lines = [entry["subject"], f"{entry['date']} | {entry['build']}", "", entry["summary"], ""]
    for s in entry["sections"]:
        lines.append(KINDS[s["kind"]][0])
        lines += [f"- {i['head']} {i['text']}" for i in s["items"]]
        lines.append("")
    lines += [f"{p['caption'].rstrip('.')}: {RAW + p['file']}" for p in entry["pictures"]]
    lines += ["", f"Code: {REPO}", "Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}", "Sent from a no-reply address, so replies are not read."]
    return "\n".join(lines) + "\n"


def write_news():
    """The game cannot read emails/, which the Docker image leaves out, so what it shows is copied into content/."""
    entries = [json.loads(p.read_text(encoding="utf-8")) | {"file": p.stem} for p in ENTRIES.glob("*.json")]
    entries.sort(key=lambda e: (datetime.datetime.strptime(e["date"], "%d %B %Y"), e["file"]), reverse=True)
    news = [{k: e[k] for k in ("date", "build", "summary", "sections")} for e in entries[:NEWS_KEPT]]
    NEWS.write_text(json.dumps(news, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    if len(sys.argv) > 1:
        path = pathlib.Path(sys.argv[1])
        entry = json.loads(path.read_text(encoding="utf-8"))
        path.with_suffix(".html").write_text(render(entry), encoding="utf-8")
        path.with_suffix(".txt").write_text(plain(entry), encoding="utf-8")
    write_news()


if __name__ == "__main__":
    main()
