import numpy as np
import pytest

from analyze import beat_energy
from beat_alloc import allocate_switch_points, dynamic_switch_ideals


def test_energy_is_per_beat_bounded_stable_and_tracks_loudness():
    sr = 100
    y = np.concatenate([np.full(sr, 0.01, dtype=np.float32), np.full(sr, 0.5, dtype=np.float32), np.full(sr, 0.1, dtype=np.float32)])
    beats = np.array([0.0, 1.0, 2.0])
    first = beat_energy(y, sr, beats, 3.0)
    assert len(first) == 3 and all(0 <= value <= 1 for value in first)
    assert first[1] > first[2] > first[0]
    assert beat_energy(y, sr, beats, 3.0) == first


def test_silence_and_constant_energy_use_neutral_half():
    for y in [np.zeros(300, dtype=np.float32), np.ones(300, dtype=np.float32)]:
        assert beat_energy(y, 100, np.array([0.0, 1.0, 2.0]), 3.0) == [0.5, 0.5, 0.5]


def test_dynamic_targets_put_more_switches_in_high_energy_and_keep_constraints():
    beats = [float(i) for i in range(20)]
    energy = [0.0] * 10 + [1.0] * 10
    ideals = dynamic_switch_ideals(20, 8, beats, energy)
    assert ideals is not None and len(ideals) == 7
    assert sum(point >= 10 for point in ideals) > sum(point < 10 for point in ideals)
    switches = allocate_switch_points(20, 8, beats, min_gap=1, ideal_points=ideals)
    assert len(switches) == 7
    assert min(b - a for a, b in zip([0, *switches], switches)) >= 1


@pytest.mark.parametrize(
    "energy",
    [
        [1.0] + [0.0] * 19,
        [0.0] + [1.0] * 19,
    ],
)
def test_dynamic_targets_hard_limit_skewed_intervals(energy):
    duration = 20
    n_photos = 8
    ideals = dynamic_switch_ideals(duration, n_photos, [float(i) for i in range(20)], energy)
    assert ideals is not None and len(ideals) == n_photos - 1
    intervals = [end - start for start, end in zip([0, *ideals], [*ideals, duration])]
    average = duration / n_photos
    assert sum(intervals) == pytest.approx(duration)
    assert all(0.6 * average <= interval <= 1.6 * average for interval in intervals)


def test_invalid_energy_falls_back_and_uniform_is_bit_exact():
    beats = [float(i) for i in range(20)]
    baseline = allocate_switch_points(20, 5, beats)
    for invalid in [None, [0.5], [float("nan")] * 20, [2.0] * 20]:
        assert dynamic_switch_ideals(20, 5, beats, invalid) is None
        assert allocate_switch_points(20, 5, beats, ideal_points=None) == baseline
    neutral = dynamic_switch_ideals(20, 5, [0.5 + i for i in range(20)], [0.5] * 20)
    assert neutral == pytest.approx([4.0, 8.0, 12.0, 16.0])
