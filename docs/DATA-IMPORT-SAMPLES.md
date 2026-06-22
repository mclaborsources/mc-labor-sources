# Staging test sample rows

Use these rows on staging after running `supabase db push` (or applying migration `20250624000001_master_import.sql`).
Import in order: Employees → Customers → Jobs → Assignments.

## Employees (tab-separated)

```
Employee ID	First Name	Last Name	Cell	Email	Trade / Position	Pay Rate	Bill Rate	Status
E001	John	Smith	555-0101	john.smith@example.com	Electrician	28.50	45.00	ACTIVE
E002	Maria	Garcia	555-0102	maria.g@example.com	Plumber	30.00	48.00	ACTIVE
E003	James	Wilson	555-0103	j.wilson@example.com	Carpenter	26.00	42.00	ACTIVE
E004	Sarah	Lee	555-0104	s.lee@example.com	Laborer	22.00	38.00	ACTIVE
E005	Tom	Brown	555-0105	t.brown@example.com	Welder	32.00	50.00	INACTIVE
```

## Customers (wide row — one row)

```
Customer ID	Customer Type	Name	Salesman	Street	City	State	Zip	Contact 1 First Name	Contact 1 Last Name	Contact 1 Title	Contact 1 Email	Contact 1 Cell	Contact 1 Office Phone
C100	General	Acme Construction	Chris Adams	100 Main St	Dallas	TX	75201	Jane	Doe	Project Manager	jane@acme.example.com	555-0201	555-0200
```

Second customer (paste separately or add second row):

```
C101	Industrial	Beta Builders	Pat Rivera	200 Oak Ave	Houston	TX	77001	Bob	Miller	Superintendent	bob@beta.example.com	555-0301	
```

## Jobs (wide row)

```
Job ID	Job Name	Street	City	State	Start Date	Status	Customer ID	Foreman 1 Name	Foreman 1 Email	Foreman 1 Cell
J500	Downtown Tower	500 Commerce	Dallas	TX	2025-06-01	ACTIVE	C100	Mike Foreman	mike@acme.example.com	555-0401
J501	Warehouse Reno	12 Industrial	Houston	TX	2025-07-15	ACTIVE	C101	Sue Lead	sue@beta.example.com	555-0402
```

## Assignments

```
Employee ID	Customer ID	Job ID	Job Name	First Name	Last Name
E001	C100	J500	Downtown Tower	John	Smith
E002	C100	J500	Downtown Tower	Maria	Garcia
E003	C101	J501	Warehouse Reno	James	Wilson
```

### Conflict test

Assign E001 to J501 while E001 is still active on J500 — preview should show conflict. Choose **Move** with end date and start date, then confirm.

```
E001	C101	J501	Warehouse Reno	John	Smith
```

## Production pilot checklist

1. Supabase backup / PITR snapshot on portal.mclabor.com
2. Run staging imports above and verify counts in Import History
3. Pilot with Raymond/Brian on production with 5 employees, 2 customers, 2 jobs, 3 assignments
4. Larger bulk import in same order
