"""
Threshold resolution and capacity-based triage.

- `resolve_threshold` picks the operating threshold for a request:
    1. explicit config override, else
    2. a group-aware threshold (e.g. per catchment_type) from config or the
       model card -- this is what fixes the urban under-flagging, since each
       subgroup gets an operating point suited to its base rate, else
    3. the model's global tuned threshold.

- `select_top_n` supports a fixed outreach budget: flag the N highest-risk
  patients (optionally within each facility) instead of using a threshold.
"""

from __future__ import annotations


def resolve_threshold(config, card: dict | None, request, global_threshold: float):
    if config.threshold_override is not None:
        return float(config.threshold_override), "override"

    by = config.threshold_by
    if by:
        tmap = config.threshold_map
        if tmap is None and card and card.get("group_threshold_by") == by:
            tmap = card.get("group_thresholds")
        group_val = getattr(request.facility, by, None) if request is not None else None
        if tmap and group_val in tmap:
            return float(tmap[group_val]), f"{by}={group_val}"

    return float(global_threshold), "global"


def select_top_n(items: list[dict], n: int, by_facility: bool = False) -> set:
    """items: [{'patient_id','probability','facility_id'}...] -> set of selected patient_ids."""
    if n is None or n <= 0:
        return set()
    selected = set()
    if by_facility:
        groups: dict = {}
        for it in items:
            groups.setdefault(it.get("facility_id"), []).append(it)
        for rows in groups.values():
            for it in sorted(rows, key=lambda r: r["probability"], reverse=True)[:n]:
                selected.add(it["patient_id"])
    else:
        for it in sorted(items, key=lambda r: r["probability"], reverse=True)[:n]:
            selected.add(it["patient_id"])
    return selected
