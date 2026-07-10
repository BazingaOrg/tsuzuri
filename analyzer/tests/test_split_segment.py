"""_split_segment 单元测试:长段按词级时间戳拆行。"""

from whisper_backend import MAX_LINE_UNITS, Segment, _split_segment, _units


def make_words(text: str, start: float = 0.0, gap: float = 0.05, dur: float = 0.3):
    """把句子按空格造成 (word, start, end) 序列,词间隙 gap 秒。"""
    words, t = [], start
    for w in text.split(" "):
        words.append((f" {w}", t, t + dur))
        t += dur + gap
    return words


class TestSplitSegment:
    def test_short_segment_untouched(self):
        segs = _split_segment("short line", 0.0, 2.0, 0.9, make_words("short line"))
        assert len(segs) == 1
        assert segs[0].text == "short line"

    def test_long_segment_splits_within_limit(self):
        text = "one two three four five six seven eight nine ten " * 3
        words = make_words(text.strip())
        segs = _split_segment(text.strip(), 0.0, 20.0, 0.8, words)
        assert len(segs) > 1
        assert all(_units(s.text) <= MAX_LINE_UNITS for s in segs)

    def test_no_words_keeps_whole(self):
        text = "x" * 200
        segs = _split_segment(text, 0.0, 10.0, 0.8, [])
        assert segs == [Segment(text, 0.0, 10.0, 0.8)]

    def test_split_prefers_phrase_gap(self):
        # 两句歌词被并成一段,句间有 0.5s 停顿 → 应从停顿处断开
        w1 = make_words("feels so friendly when you say hello", start=0.0)
        pause_at = w1[-1][2]
        w2 = make_words("no wonder i want to wrap you up and take you home",
                        start=pause_at + 0.5)
        text = "feels so friendly when you say hello no wonder i want to wrap you up and take you home"
        segs = _split_segment(text, 0.0, w2[-1][2], 0.8, w1 + w2)
        assert len(segs) == 2
        assert segs[0].text == "feels so friendly when you say hello"
        assert segs[1].text.startswith("no wonder")

    def test_split_prefers_capitalized_phrase_start(self):
        # 无停顿(歌声连续),但 Whisper 把新句首词大写 → 应从大写词前断开
        text = "Feels so friendly when you say hello No wonder I want to wrap you up and take you home"
        words = make_words(text, gap=0.0)
        segs = _split_segment(text, 0.0, words[-1][2], 0.8, words)
        assert len(segs) == 2
        assert segs[0].text == "Feels so friendly when you say hello"
        assert segs[1].text == "No wonder I want to wrap you up and take you home"

    def test_long_silence_always_splits(self):
        w1 = make_words("short intro", start=0.0)
        w2 = make_words("after long pause", start=w1[-1][2] + 3.0)
        segs = _split_segment("short intro after long pause " + "pad " * 20,
                              0.0, 30.0, 0.8, w1 + w2)
        assert segs[0].text == "short intro"

    def test_timestamps_follow_words(self):
        words = make_words("a b c d e f g h i j k l m n o p q r s t u v w x y z aa bb cc dd ee ff")
        segs = _split_segment(" ".join(w[0].strip() for w in words), 0.0, 99.0, 0.7, words)
        for s in segs:
            assert s.start < s.end
        for a, b in zip(segs, segs[1:]):
            assert a.end <= b.start + 1e-9
