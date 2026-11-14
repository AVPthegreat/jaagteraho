"""Splits long lists into pages."""


def paginate(items, page: int = 1, size: int = 20):
    page = max(1, int(page))
    size = max(1, min(100, int(size)))
    start = (page - 1) * size
    return {"items": items[start : start + size], "page": page, "size": size, "total": len(items)}


def page_count(total: int, size: int) -> int:
    return (total + size - 1) // size
