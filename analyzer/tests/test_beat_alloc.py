"""beat_alloc 单元测试:固定 beats 输入断言输出(M3 验收项)。"""

import pytest

from beat_alloc import allocate_switch_points


def is_strictly_increasing(xs):
    return all(a < b for a, b in zip(xs, xs[1:]))


def min_gap_of(xs, duration):
    pts = [0.0, *xs, duration]
    return min(b - a for a, b in zip(pts, pts[1:]))


class TestBasic:
    def test_single_photo_no_switches(self):
        assert allocate_switch_points(30.0, 1, [1.0, 2.0]) == []

    def test_three_photos_snap_to_downbeats(self):
        # 120 BPM、4 拍一小节 → 重拍每 2s;30s / 3 张 → 理想网格 10s, 20s
        downbeats = [float(t) for t in range(0, 30, 2)]
        result = allocate_switch_points(30.0, 3, downbeats)
        assert result == [10.0, 20.0]

    def test_snaps_to_nearest_candidate(self):
        result = allocate_switch_points(30.0, 3, [9.3, 10.4, 19.8, 21.0])
        assert result == [10.4, 19.8]  # |10.4-10| < |9.3-10|;|19.8-20| < |21-20|

    def test_output_count(self):
        downbeats = [float(t) / 2 for t in range(0, 120)]
        for n in (2, 5, 12):
            assert len(allocate_switch_points(60.0, n, downbeats)) == n - 1


class TestConstraints:
    def test_strictly_increasing_on_conflict(self):
        # 两个理想点(10s, 20s)都最近吸附到 15.0 → 次者必须顺延
        result = allocate_switch_points(30.0, 3, [15.0, 17.0])
        assert result == [15.0, 17.0]
        assert is_strictly_increasing(result)

    def test_min_gap_enforced(self):
        # 密集候选(每 0.1s)也必须保持 min_gap
        candidates = [round(0.1 * i, 1) for i in range(1, 300)]
        result = allocate_switch_points(30.0, 10, candidates, min_gap=2.0)
        assert len(result) == 9
        assert min_gap_of(result, 30.0) >= 2.0 - 1e-9

    def test_first_switch_after_strong_onset(self):
        # 前奏 8s:首个切换点不得早于 not_before
        downbeats = [float(t) for t in range(0, 30, 2)]
        result = allocate_switch_points(30.0, 3, downbeats, not_before=8.0)
        assert result[0] >= 8.0
        assert is_strictly_increasing(result)

    def test_last_photo_keeps_min_gap(self):
        # 候选一直排到 29.9s,但末张照片也要 >= min_gap
        candidates = [round(0.5 * i, 1) for i in range(1, 60)]
        result = allocate_switch_points(30.0, 4, candidates, min_gap=2.0)
        assert result[-1] <= 30.0 - 2.0 + 1e-9

    def test_flash_mode_smaller_gap(self):
        # 快闪模式:min_gap 放宽到 0.8s,候选为每拍
        beats = [round(0.5 * i, 1) for i in range(1, 180)]
        result = allocate_switch_points(90.0, 60, beats, min_gap=0.8)
        assert len(result) == 59
        assert min_gap_of(result, 90.0) >= 0.8 - 1e-9


class TestFallback:
    def test_no_candidates_falls_back_to_grid(self):
        result = allocate_switch_points(30.0, 3, [])
        assert len(result) == 2
        assert is_strictly_increasing(result)
        assert result == [10.0, 20.0]  # 无候选 → 直接用均匀网格

    def test_sparse_candidates_partial_fallback(self):
        # 只有一个可用候选,其余回退网格
        result = allocate_switch_points(30.0, 4, [7.4])
        assert len(result) == 3
        assert result[0] == 7.4
        assert is_strictly_increasing(result)
        assert min_gap_of(result, 30.0) >= 2.0 - 1e-9

    def test_fallback_after_tail_candidate_keeps_min_gap(self):
        # 回归:唯一候选在尾部(27.5),距两个理想点都超过吸附上限(半步长 5s)
        # → 全部回退均匀网格。旧实现曾吸附 27.5 后挤出 0.5s 间隔违反 min_gap
        result = allocate_switch_points(30.0, 3, [27.5])
        assert result == [10.0, 20.0]
        assert min_gap_of(result, 30.0) >= 2.0 - 1e-9

    def test_snap_distance_capped_at_half_grid_step(self):
        # 候选偏离所有理想网格点超过半个步长(60/4/2=7.5)→ 回退网格,不毁节奏
        result = allocate_switch_points(60.0, 4, [58.0])
        assert result == [15.0, 30.0, 45.0]

    def test_extreme_mismatch_may_drop_points(self):
        # 10s 塞 10 张(min_gap 2s)必然放不下 9 个切换点
        result = allocate_switch_points(10.0, 10, [])
        assert is_strictly_increasing(result)
        assert all(t < 10.0 for t in result)
        assert min_gap_of(result, 10.0) >= 2.0 - 1e-9

    def test_duration_shorter_than_two_gaps_drops_switch(self):
        # 3s 放不下任何满足 min_gap=2 的切换点:宁可少切,不违反约束
        assert allocate_switch_points(3.0, 2, [], min_gap=2.0) == []

    def test_not_before_near_end_never_violated(self):
        # 强 onset 落在结尾 min_gap 内:与其在 onset 前切换,不如放弃该切换点
        result = allocate_switch_points(30.0, 2, [], not_before=29.5)
        assert all(t >= 29.5 for t in result)  # 实际应为空


class TestValidation:
    def test_invalid_n_photos(self):
        with pytest.raises(ValueError):
            allocate_switch_points(30.0, 0, [1.0])

    def test_invalid_duration(self):
        with pytest.raises(ValueError):
            allocate_switch_points(0.0, 3, [1.0])
