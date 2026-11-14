"""An in-memory store with the same shape as a database table."""

from .errors import NotFound


class Store:
    def __init__(self, name: str):
        self.name = name
        self.rows: dict[int, object] = {}
        self.next_id = 1

    def add(self, row):
        row.id = self.next_id
        self.rows[row.id] = row
        self.next_id += 1
        return row

    def get(self, row_id: int):
        row = self.rows.get(int(row_id))
        if row is None:
            raise NotFound(f"{self.name} {row_id} not found")
        return row

    def all(self):
        return list(self.rows.values())

    def delete(self, row_id: int) -> None:
        self.get(row_id)
        del self.rows[int(row_id)]
