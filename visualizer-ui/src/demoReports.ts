export const QA_REPORT_DEMO = `Here's the full verification report for the order and payment flow:

---
Flow Verification: PASS (with issues)

The core flow works end-to-end — login → products → add to cart → cart → checkout → place order → order detail (PENDING → COMPLETED). However, several issues were found:

---
Critical

1. Order total does NOT reflect promo discount (Order Detail & My Orders)
- Cart and Checkout correctly show: Subtotal $1199.00, Promo discount −$239.80 (20%), Total $959.20
- After placing the order, Order Detail and My Orders list show: Total $1199.00 (full undiscounted price)
- The discount is completely missing from the order record — the order service is not receiving/persisting the discounted total from payment/cart

---
High

2. No feedback when adding item to cart
- Clicking "Add to cart" shows zero visual feedback (no toast, no snackbar, no animation on the button)
- The only indicator is a small red badge 1 appearing on the Cart nav icon — very easy to miss

---
Medium

3. Price rounding discrepancy between Cart and Checkout summary panel
- Cart page: Promo discount = −$239.80
- Checkout right panel: Promo discount = −$239.60
- $0.20 difference — suggests two different rounding implementations across services

4. "Order placed successfully!" banner persists after page refresh
- The success banner survives a full reload of /orders/16
- It should be ephemeral (shown only immediately post-redirect, cleared on reload)

5. Checkout order summary panel is incomplete
- Right panel only shows a thumbnail and the discount line — no item name, no subtotal, no total
- Users cannot fully verify the order breakdown before placing it

6. Shipping address text invisible in checkout form after filling
- The filled address appears blank in the screenshot — likely a text color contrast issue (dark text on dark background)

---
Low

7. My Orders list has extremely low contrast text
- Order IDs, dates, and item names are nearly unreadable against the dark background — accessibility failure

8. No pagination on My Orders
- All 16 orders render as a single long page with no search, filter, or pagination controls

9. Redundant "Login" nav button on the login page
- The nav shows an active Login button while the user is already on the login page

10. Transaction ID absent on PENDING order detail
- The TXN reference only appears after order reaches COMPLETED status — users have no reference number immediately after placing the order`;
