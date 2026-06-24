# Staging test sample rows

## Reference workbook (preferred)

**File:** `docs/2026-06-19 Sample Imports.xlsx`

| Sheet | Rows (approx.) | Notes |
|-------|----------------|-------|
| Employees | 170 | No Status column; EmployeeID, EmFirstName, EmLastName, etc. |
| Customers | 72 | Wide contact columns `CustomerContactFName01` … `10` |
| Jobs | 98 | **ProjectID** only — no CustomerID column |
| Assignments | 180 | CustomerID + ProjectID + EmployeeID |

**Week ending:** 06/19/2026 (select Custom week ending Friday `2026-06-19` in admin import UI).

### Upload steps

1. Staging/local Supabase with migrations applied (`supabase db push`)
2. Admin → **Data Import** → **Weekly Workbook**
3. Working week → **Custom** → `2026-06-19`
4. Upload `2026-06-19 Sample Imports.xlsx`
5. Review cross-sheet validation and four section previews
6. Resolve assignment conflicts if any
7. **Confirm Full Import** (staging only)

CustomerID on Jobs is inferred from Assignments for this file (every ProjectID appears in Assignments with a single CustomerID).

---

## Legacy paste samples (single-sheet mode)

Use **Single-Sheet Paste** for smaller ad-hoc tests.

### Employees (tab-separated)

Status column optional:

```
EmployeeID	EmFirstName	EmLastName	EmMobilePhone	EmEmail	Trade	PayRate	BillRate
9156	Arben	Kroi	(857) 231-3948	arbenkroi@gmail.com	Electrician	28	46
```

### Customers (wide row)

```
CustomerID	Salesman	CustomerType	CustBusName	Street	City	State	Zip	CustomerContactFName01	CustomerContactLName01	...
176	Eamon O'Hara	01 Electrical	Amore Electric Co	65 Avco Rd  Unit F	Haverhill	MA	01835	Kim	Biele	...
```

### Jobs

```
ProjectID	SiteName	SiteStreet	SiteCity	SiteState	StartDate	CustomerForeman	CustomerForemanPhone
3694	Office	4 Arlington Road	Needham	MA	12/7/15	Ray Mc Veigh	(617) 293-4069
```

Add **CustomerID** column if importing Jobs without a matching Assignments sheet.

### Assignments

```
CustomerID	ProjectID	EmployeeID
176	11033	13110
```

Select working week before preview (week ending 06/19/2026 for sample data).

---

## Production pilot

**Do not** use production until staging sign-off with Raymond.

1. Staging workbook import with sample file
2. Verify Import History (week + conflict counts on assignment runs)
3. Pilot with Raymond on staging with a trimmed workbook
4. Production only after explicit approval
