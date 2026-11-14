"""A student marketplace: listings, offers, orders and reviews. Routes every request to its handler."""

from .core.errors import NotFound
from .core.http import fail
from .seller import routes as seller_routes
from .listing import routes as listing_routes
from .offer import routes as offer_routes
from .order import routes as order_routes
from .review import routes as review_routes
from .category import routes as category_routes
from .coupon import routes as coupon_routes
from .chat import routes as chat_routes
from .report import routes as report_routes
from .payout import routes as payout_routes
from .wishlist import routes as wishlist_routes
from .pickup import routes as pickup_routes
from .refund import routes as refund_routes

ROUTES = {}
ROUTES.update(seller_routes.ROUTES)
ROUTES.update(listing_routes.ROUTES)
ROUTES.update(offer_routes.ROUTES)
ROUTES.update(order_routes.ROUTES)
ROUTES.update(review_routes.ROUTES)
ROUTES.update(category_routes.ROUTES)
ROUTES.update(coupon_routes.ROUTES)
ROUTES.update(chat_routes.ROUTES)
ROUTES.update(report_routes.ROUTES)
ROUTES.update(payout_routes.ROUTES)
ROUTES.update(wishlist_routes.ROUTES)
ROUTES.update(pickup_routes.ROUTES)
ROUTES.update(refund_routes.ROUTES)


def handle(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    handler = ROUTES.get((method, path))
    if handler is None:
        return fail(NotFound(f"no route {method} {path}"))
    return handler({"body": body or {}, "query": query or {}, "path": path})
