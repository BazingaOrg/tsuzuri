"""节拍分配算法(plan 阶段核心,实现方案第四节)。

MVP:贪心吸附。理想均匀网格 → 吸附到最近的候选节拍(优先重拍),
约束:严格单调递增、相邻间隔 >= min_gap、首个切换点 >= 首个强 onset。
吸附距离上限为一个网格步长:候选太远时宁可不踩拍也不毁节奏,
回退到未吸附的网格时间(取 prev + min_gap 下界);
极端失配(时长塞不下 N-1 个 min_gap)时输出可能少于 N-1 个,由 plan 层决定丢弃尾部照片。

升级路径(非 MVP):动态规划求全局最优,见计划文档。
"""

from __future__ import annotations

from bisect import bisect_left


def allocate_switch_points(
    duration: float,
    n_photos: int,
    candidates: list[float],
    *,
    min_gap: float = 2.0,
    not_before: float = 0.0,
) -> list[float]:
    """返回 n_photos - 1 个切换点(秒),严格递增。

    duration: 音频时长;candidates: 节拍候选集(通常传 downbeats,快闪模式传 beats);
    not_before: 首个切换点下界(首个强 onset);min_gap: 相邻切换点最小间隔。
    """
    if n_photos < 1:
        raise ValueError("n_photos must be >= 1")
    if n_photos == 1:
        return []
    if duration <= 0:
        raise ValueError("duration must be positive")

    # 可用候选:落在 [not_before, duration - min_gap] 内(末张照片也要 >= min_gap)
    usable = sorted(c for c in candidates if not_before <= c <= duration - min_gap)
    # 吸附距离上限半个步长:再远就更靠近相邻槽位了,宁可不踩拍也不毁节奏
    max_snap = duration / n_photos / 2

    grid = [i * duration / n_photos for i in range(1, n_photos)]
    result: list[float] = []
    prev = 0.0
    used_idx = -1  # usable 中已消费到的下标,保证单调 + 不重复吸附

    for i, ideal in enumerate(grid):
        lower = max(prev + min_gap if result else max(min_gap, not_before), not_before)
        # 候选区间起点:第一个 >= lower 且未被占用的候选
        start = max(bisect_left(usable, lower), used_idx + 1)
        best = None
        best_dist = None
        for j in range(start, len(usable)):
            d = abs(usable[j] - ideal)
            if best_dist is None or d < best_dist:
                best, best_dist = j, d
            elif usable[j] > ideal:
                break  # 已越过理想点且距离开始增大,后面只会更远
        if best is not None and best_dist is not None and best_dist <= max_snap:
            result.append(usable[best])
            used_idx = best
            prev = usable[best]
        else:
            # 候选耗尽:回退到未吸附时间,尽量贴近理想网格。
            # lower 保证与前点间隔 >= min_gap;超出尾部空间则停止分配,
            # 剩余照片由 plan 层丢弃(所有约束优先于数量)。
            t = max(ideal, lower)
            if t > duration - min_gap:
                break
            result.append(t)
            prev = t

    return result
