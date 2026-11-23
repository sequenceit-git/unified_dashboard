# ERP Application — Design System

> **Design direction:** Modern Enterprise — clean, dense, calm, and highly usable.
>
> The interface should feel like serious business software rather than a marketing website or a flashy dashboard.

---

## 1. Design Philosophy

The ERP should prioritize:

1. **Clarity** — users should immediately understand what they are looking at.
2. **Efficiency** — frequent actions should require as few steps as possible.
3. **Information density** — show useful business information without excessive whitespace.
4. **Consistency** — the same interaction should look and behave the same everywhere.
5. **Predictability** — users should not have to relearn the interface between modules.
6. **Trust** — financial, inventory, customer, and transaction data should feel reliable and controlled.
7. **Scalability** — the design must remain usable with hundreds or thousands of records.

### Core UX principle

> **FIND → UNDERSTAND → ACT → CONFIRM**

An ERP is primarily a productivity tool. Avoid designing it like a promotional website.

---

# 2. Typography

## Primary Font: Geist

Use **Geist** as the primary typeface throughout the application.

### Font weights

- `400` — Regular / body text
- `500` — Medium / labels / navigation
- `600` — Semibold / headings / important values
- `700` — Bold / major emphasis only

Avoid using many different weights on the same screen.

### Recommended type scale

| Element | Size | Weight |
|---|---:|---:|
| Page title | 24px | 600 |
| Section title | 16px | 600 |
| Subsection | 14px | 600 |
| Body | 14px | 400 |
| Secondary text | 13px | 400 |
| Table text | 13–14px | 400 |
| Table header | 12–13px | 500 |
| Caption | 12px | 400 |
| KPI number | 24–32px | 600 |
| Button | 13–14px | 500 |
| Input text | 14px | 400 |

### Typography rules

- Prefer hierarchy through **size and weight**, not excessive colors.
- Avoid all-caps UI text except for very small labels where necessary.
- Keep body text comfortable but compact.
- Numbers should remain highly readable, especially for prices, quantities, balances, and totals.
- Do not use more than one primary UI font.

---

# 3. Color System

## Primary palette

```text
Primary:          #4F46E5
Primary Hover:    #4338CA
Primary Soft:     #EEF2FF
```

The primary color is **Indigo**.

Use it primarily for interactive elements rather than decorating the entire interface.

## Neutral palette

```text
Background:       #F8FAFC
Surface:          #FFFFFF

Text Primary:     #0F172A
Text Secondary:   #64748B
Text Muted:       #94A3B8

Border:           #E2E8F0
Border Strong:    #CBD5E1

Disabled BG:      #F1F5F9
```

## Semantic colors

```text
Success:          #16A34A
Success Soft:     #F0FDF4

Warning:          #D97706
Warning Soft:     #FFFBEB

Danger:           #DC2626
Danger Soft:      #FEF2F2

Info:             #2563EB
Info Soft:        #EFF6FF
```

### Semantic meaning

| Color | Meaning |
|---|---|
| Green | Success, active, completed |
| Amber | Pending, warning, attention |
| Red | Failed, cancelled, overdue, destructive |
| Blue | Information, processing |
| Grey | Inactive, disabled, draft |

Keep these meanings consistent throughout every module.

---

# 4. Color Usage Rule

The application should be approximately:

- **80–90% neutral**
- **10–20% accent / semantic colors**

Do not make every component primary-colored.

### Avoid

```text
Blue sidebar
Blue cards
Blue headings
Blue table headers
Blue icons
Blue badges
Blue charts
Blue buttons
```

### Prefer

```text
Neutral UI
    +
Indigo for actions / selected states
    +
Semantic colors for statuses
```

The primary color should mainly identify:

- Primary buttons
- Selected navigation
- Active tabs
- Links
- Focus states
- Important actions

---

# 5. Spacing System

Use a consistent spacing scale:

```text
4px
8px
12px
16px
20px
24px
32px
40px
48px
```

### Common usage

| Use | Spacing |
|---|---:|
| Icon ↔ text | 8px |
| Input internal padding | 12px |
| Form field gap | 16px |
| Card padding | 20–24px |
| Section gap | 24–32px |
| Major page sections | 32–40px |

Do not randomly introduce values such as 13px, 17px, 23px, etc.

---

# 6. Border Radius

Keep the UI professional and restrained.

```text
Small controls:   6px
Inputs/buttons:   6–8px
Cards:            8–12px
Modals:           12px
```

Avoid excessive `20px+` rounded corners.

The ERP should feel **structured**, not playful.

---

# 7. Shadows

Use shadows sparingly.

### Default

Most cards should rely on:

```text
background + border
```

rather than a large shadow.

### Shadow usage

- Dropdowns → subtle shadow
- Popovers → subtle shadow
- Modal → moderate shadow
- Cards → preferably no shadow or very subtle shadow

Avoid floating every component with a shadow.

---

# 8. Layout

## Standard application structure

```text
┌─────────────────────────────────────────────────────────┐
│ Sidebar │ Header / Search / User                        │
│         ├───────────────────────────────────────────────┤
│         │                                               │
│         │ Page Header                                   │
│         │                                               │
│         │ Content                                       │
│         │                                               │
│         │                                               │
│         └───────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────┘
```

### Sidebar

The sidebar should be:

- Predictable
- Compact
- Easy to scan
- Consistent across modules
- Icon + text based

Do not overload it with decorative elements.

Example:

```text
Overview

Sales
Purchases
Products
Customers
Suppliers
Inventory
Accounts
Reports

Settings
```

Use one consistent icon family.

---

# 9. Icons

Use a single icon style throughout the application.

Recommended:

**Lucide**

Rules:

- Prefer outline icons.
- Keep icon sizes consistent.
- Default UI icon: 16–18px.
- Navigation icon: 18px.
- Larger action icon: 20px.
- Do not mix filled and outline icon styles without a clear reason.

Icons should support text, not replace important text.

---

# 10. Tables

Tables are one of the most important components in an ERP.

### Recommended table characteristics

- 13–14px text
- 44–48px row height
- Clear column headers
- Subtle borders
- Hover state
- Sticky header where useful
- Sorting
- Filtering
- Search
- Pagination
- Bulk selection
- Column visibility when appropriate

Example:

```text
☐  Customer       Phone          Balance       Status       Actions
──────────────────────────────────────────────────────────────────
☐  Rahim Ahmed    017...         ৳24,500       Active        •••
☐  Karim Ltd      018...         ৳8,200        Pending       •••
☐  ABC Traders    019...         ৳0            Active        •••
```

### Table rules

- Right-align numeric values.
- Keep status badges compact.
- Avoid unnecessary zebra striping.
- Use whitespace and subtle borders to separate rows.
- Do not make every row visually heavy.
- Keep frequently used actions accessible.

---

# 11. Forms

Forms should be highly consistent.

Recommended pattern:

```text
Customer Name *
┌──────────────────────────────────────┐
│ Enter customer name                  │
└──────────────────────────────────────┘

Phone
┌──────────────────────────────────────┐
│ 01XXXXXXXXX                          │
└──────────────────────────────────────┘

Address
┌──────────────────────────────────────┐
│                                      │
│                                      │
└──────────────────────────────────────┘

                         Cancel  Save
```

### Form rules

- Use persistent labels.
- Avoid placeholder-only labels.
- Use clear required indicators.
- Keep field spacing consistent.
- Group related fields.
- Show validation errors close to the affected field.
- Do not hide important fields inside unnecessary steps.

---

# 12. Buttons

Use a simple hierarchy.

### Primary

For the main action:

```text
Save Customer
Create Sale
Add Product
Confirm Payment
```

### Secondary

For alternative actions:

```text
Cancel
Back
View Details
```

### Destructive

For irreversible actions:

```text
Delete
Cancel Transaction
Remove
```

Destructive actions should use the danger color and require confirmation when appropriate.

---

# 13. Status Badges

Keep status badges compact.

Example:

```text
● Active
● Pending
● Completed
● Cancelled
● Draft
```

Recommended treatment:

```text
Green text + green soft background
Amber text + amber soft background
Red text + red soft background
Grey text + grey background
```

Avoid large colorful pills that dominate the table.

---

# 14. Dashboard Design

Do not turn the dashboard into a collection of giant cards.

Prioritize useful information:

```text
Page Header

┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Revenue    │ │ Sales      │ │ Customers  │ │ Due        │
│ ৳...       │ │ ...        │ │ ...        │ │ ৳...       │
└────────────┘ └────────────┘ └────────────┘ └────────────┘

Recent Sales
──────────────────────────────────────────────

Outstanding Payments
──────────────────────────────────────────────

Inventory / Activity
──────────────────────────────────────────────
```

### KPI cards

Use them for genuinely important metrics.

Do not create a KPI card for every available statistic.

---

# 15. Cards

Cards should group related information.

Use cards for:

- KPI groups
- Summary information
- Important settings
- Related form sections
- Detail views

Avoid:

> Card inside card inside card inside card

If everything is a card, nothing has visual importance.

---

# 16. Search & Filtering

ERP users frequently work with large datasets.

Search and filtering should therefore be first-class features.

Recommended pattern:

```text
Search customers...     Filter ▾     Date ▾     Status ▾

[Active] [Pending] [Overdue]
```

Filters should be easy to:

- Apply
- Remove
- Understand
- Reuse

Show active filters clearly.

---

# 17. Modals vs Drawers vs Pages

### Use a modal for:

- Confirmation
- Small focused actions
- Quick edits
- Short forms

### Use a drawer for:

- Record preview
- Quick detail inspection
- Secondary workflows

### Use a full page for:

- Complex forms
- Detailed records
- Large datasets
- Multi-step workflows

Do not put large ERP workflows inside tiny modals.

---

# 18. Destructive Actions

Important business data requires deliberate actions.

Example:

```text
Delete Customer?

This will remove the customer from active records.
Existing transactions will not be deleted.

                 Cancel     Delete
```

For especially important actions, clearly explain:

- What will happen
- What will not happen
- Whether it can be undone

---

# 19. Progressive Disclosure

Do not show every possible option at once.

### Basic

```text
Customer
Products
Quantity
Price
Discount
Payment
```

### Advanced

```text
Advanced options ▾

Tax
Shipping
Internal note
Reference
Additional discount
```

The common workflow should remain simple while advanced functionality remains accessible.

---

# 20. Responsive Behavior

Desktop should be the primary design target for an ERP, but the interface should degrade gracefully.

### Desktop

Use:

- Persistent sidebar
- Multi-column layouts
- Dense tables
- Full filtering

### Tablet

- Collapsible sidebar
- Reduced columns
- Horizontal table scrolling where necessary

### Mobile

Do not blindly shrink the desktop interface.

Instead:

- Convert complex tables into prioritized rows/cards where appropriate.
- Keep primary actions accessible.
- Collapse secondary information.
- Use drawers and stacked forms.

---

# 21. Data Visualization

Charts should communicate information, not decorate the dashboard.

Recommended:

- Bar charts
- Line charts
- Simple area charts
- Donut charts only when useful

Avoid:

- Excessive gradients
- 3D charts
- Decorative animations
- Too many chart colors

Keep chart colors consistent with the semantic palette.

---

# 22. Animation

Use animation sparingly.

Good:

- Dropdown opening
- Modal opening
- Drawer transition
- Toast notification
- Button loading state
- Small state transitions

Avoid:

- Large page animations
- Constant movement
- Decorative bouncing
- Long transitions

Recommended transition duration:

```text
120–200ms
```

The ERP should feel **fast**.

---

# 23. Loading States

Never leave users wondering whether an action worked.

Use:

- Skeletons for content loading
- Button loading states for submissions
- Progress indicators for long operations
- Toasts for completed actions

Example:

```text
Saving...
```

then:

```text
✓ Customer saved successfully
```

---

# 24. Empty States

Empty states should explain what the user can do.

Bad:

```text
No data
```

Better:

```text
No customers found.

Add your first customer to start managing
customer records.

[ Add Customer ]
```

---

# 25. Error Handling

Errors should be:

- Clear
- Specific
- Actionable

Bad:

```text
Something went wrong.
```

Better:

```text
Unable to save the customer.

Please check the phone number and try again.
```

Do not expose technical errors such as raw database messages to normal users.

---

# 26. Navigation Principles

Navigation should reflect how the business operates.

Example:

```text
Overview

Sales
  ├─ Sales
  ├─ Returns
  └─ Invoices

Purchases
  ├─ Purchases
  └─ Suppliers

Products
  ├─ Products
  ├─ Categories
  └─ Stock

Customers
Suppliers
Accounts
Reports

Settings
```

Keep terminology consistent with the client's actual business vocabulary.

---

# 27. Workflow-First Design

Do not design screens independently.

Design around real workflows.

### Sales workflow

```text
Customer
   ↓
Create Sale
   ↓
Add Products
   ↓
Payment
   ↓
Invoice
```

### Inventory workflow

```text
Product
   ↓
Purchase
   ↓
Stock
   ↓
Adjustment
   ↓
Report
```

### Accounts workflow

```text
Customer
   ↓
Transaction
   ↓
Payment
   ↓
Due
   ↓
Report
```

The UI should make frequent workflows fast.

---

# 28. Accessibility

Minimum requirements:

- Sufficient text/background contrast
- Visible keyboard focus
- Labels for form controls
- Tooltips for icon-only actions
- Do not rely on color alone to communicate status
- Click targets should be comfortable
- Keyboard navigation should work for important workflows

---

# 29. Design Tokens — Quick Reference

```css
/* Typography */
--font-sans: Geist, system-ui, sans-serif;

/* Colors */
--color-primary: #4F46E5;
--color-primary-hover: #4338CA;
--color-primary-soft: #EEF2FF;

--color-background: #F8FAFC;
--color-surface: #FFFFFF;

--color-text-primary: #0F172A;
--color-text-secondary: #64748B;
--color-text-muted: #94A3B8;

--color-border: #E2E8F0;
--color-border-strong: #CBD5E1;

--color-success: #16A34A;
--color-success-soft: #F0FDF4;

--color-warning: #D97706;
--color-warning-soft: #FFFBEB;

--color-danger: #DC2626;
--color-danger-soft: #FEF2F2;

--color-info: #2563EB;
--color-info-soft: #EFF6FF;

/* Radius */
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;

/* Spacing */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

---

# 30. Final Design Direction

The final product should feel:

**Professional**
- Restrained colors
- Clear hierarchy
- Consistent components

**Efficient**
- Dense tables
- Fast workflows
- Minimal unnecessary clicks

**Modern**
- Geist typography
- Clean spacing
- Subtle borders
- Minimal shadows

**Enterprise-ready**
- Strong data presentation
- Clear statuses
- Reliable destructive-action handling
- Scalable navigation

### The target aesthetic

> **Modern Enterprise — not flashy SaaS.**

Think:

**Linear × Stripe Dashboard × modern accounting software**

rather than:

**Dribbble dashboard × huge cards × gradients everywhere.**

The software should communicate:

> **“This system handles serious business data.”**
