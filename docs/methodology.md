# Methodology — ELEKTO EU v1.0.0

## 1. Scope

This model calculates **heating energy only** — the electricity required to maintain
an indoor temperature of 18°C, 19°C, or 20°C in a standard residential building.

V1 does **not** include: pool/spa, EV charging, household electricity, or domestic hot water.

## 2. Core Formulas

### 2.1 Heat Loss Coefficient (UA)

```
UA = Σ(Uᵢ × Aᵢ)   [W/K]
```

Where:
- `Uᵢ` = U-value of building element i (wall, roof, floor, window) [W/(m²·K)]
- `Aᵢ` = Area of building element i [m²]

Source: Building profiles per country (`packages/schemas/BuildingProfile.schema.json`)

### 2.2 Annual Heat Demand (Q_heat)

```
Q_heat = UA × HDD_adj × 24 / 1000   [kWh/yr]
```

Where:
- `HDD_adj` = Heating Degree Days adjusted for chosen temperature (18/19/20°C)
- Factor `24` converts degree-days to degree-hours
- Factor `1000` converts Wh to kWh

Source: Eurostat HDD (base 18°C), linearly scaled for 19°C and 20°C.

### 2.3 Electricity Demand per Heating System

```
E_el = Q_heat / COP_or_SCOP   [kWh/yr]
```

Where:
- `COP_or_SCOP` = Coefficient of Performance (direct electric: 1.0; heat pumps: varies by type and climate)

### 2.4 Annual Cost (component-based)

```
Cost = E_el × (Price_energy + Price_network + Taxes) × (1 + VAT)
```

Where:
- `Price_energy` = Day-ahead spot price (ENTSO-E) or Eurostat average [EUR/kWh]
- `Price_network` = Grid/network fees [EUR/kWh]
- `Taxes` = Energy taxes and levies [EUR/kWh]
- `VAT` = Value Added Tax rate [fraction]

Source: Eurostat electricity price components for households.

## 3. Temperature Adjustment (HDD_adj)

Base HDD is defined at 18°C. For 19°C and 20°C:

```
HDD_adj(T) = HDD_18 × (T - T_outdoor_avg) / (18 - T_outdoor_avg)
```

This linear scaling is a simplification. V1 documents the error bound and
may be refined in future versions with degree-hour calculations.

## 4. COP/SCOP Climate Adjustment

COP/SCOP varies with outdoor temperature. V1 uses standardized profiles:

| System | SCOP (mild) | SCOP (moderate) | SCOP (cold) |
|--------|-------------|-----------------|-------------|
| Direct electric | 1.0 | 1.0 | 1.0 |
| Air-air heat pump | 4.0 | 3.2 | 2.2 |
| Air-water heat pump | 3.5 | 2.8 | 2.0 |
| Ground source heat pump | 4.2 | 3.8 | 3.5 |

Climate zones are derived from HDD ranges. All values are shown with
±15% uncertainty in the UI.

## 5. Economic Model

### 5.1 Simple Payback

```
Payback_years = Capex / (Cost_direct_el − Cost_system)
```

### 5.2 20-Year Total Cost of Ownership

```
TCO_20 = Capex + 20 × AnnualCost
```

V1 uses undiscounted TCO. Discounted NPV is planned for a future version.

### 5.3 Installation Costs

Stored as ranges per country, scaled from Sweden reference values using
a construction cost index. All values are visible in the Assumption Inspector.

## 6. Limitations

- No internal gains (occupants, appliances, solar gain through windows)
- No thermal mass / time lag modeling
- Linear HDD scaling is approximate
- SCOP profiles are standardized, not manufacturer-specific
- Eurostat price components are semi-annual (not real-time fees)
- Building profiles are national averages, not region-specific in V1

## 7. Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-02-15 | Initial methodology |
