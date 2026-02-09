# Dayparting Support in PWA Core Player

## Overview

Dayparting allows schedules to recur on specific days of the week at specific times, enabling patterns like:
- "Show layout X on Monday-Friday, 9am-5pm" (recurring weekly)
- "Show layout Y on weekends only"
- "Show different content on specific days"

This is different from one-off schedules which use specific date/time ranges.

## Implementation

Dayparting support has been implemented in the PWA Core player (`packages/core/src/schedule.js`) to match Xibo CMS behavior.

### Schedule Attributes

Dayparting schedules include these attributes:

```javascript
{
  file: '123',
  priority: 10,
  fromdt: '2025-01-30T09:00:00Z',  // Start time-of-day
  todt: '2025-01-30T17:00:00Z',    // End time-of-day
  recurrenceType: 'Week',           // Recurrence pattern
  recurrenceRepeatsOn: '1,2,3,4,5', // Days to repeat (ISO format)
  recurrenceRange: '2025-12-31T23:59:59Z' // Optional: when recurrence ends
}
```

### Recurrence Types

Currently supported:
- **`Week`**: Weekly recurrence on specific days of the week

### Day of Week Format

`recurrenceRepeatsOn` uses ISO day-of-week numbering:
- `1` = Monday
- `2` = Tuesday
- `3` = Wednesday
- `4` = Thursday
- `5` = Friday
- `6` = Saturday
- `7` = Sunday

Examples:
- Weekdays: `"1,2,3,4,5"`
- Weekends: `"6,7"`
- Mon/Wed/Fri: `"1,3,5"`
- Every day: `"1,2,3,4,5,6,7"`

### Time Matching

For recurring schedules:
- `fromdt` and `todt` specify **time-of-day** (not full datetime)
- Only the time portion is compared with current time
- Handles midnight crossing (e.g., 22:00 - 02:00)

For non-recurring schedules:
- `fromdt` and `todt` are full date/time ranges
- Traditional behavior is preserved for backward compatibility

### Recurrence Range

`recurrenceRange` (optional) specifies when the recurring schedule ends:
- ISO 8601 datetime string
- After this date/time, the schedule is no longer active
- Useful for "recurring until end of year" scenarios

## Examples

### Example 1: Weekday Business Hours

Show layout during business hours on weekdays:

```javascript
{
  file: '100',
  priority: 10,
  fromdt: '2025-01-30T09:00:00Z',
  todt: '2025-01-30T17:00:00Z',
  recurrenceType: 'Week',
  recurrenceRepeatsOn: '1,2,3,4,5' // Mon-Fri
}
```

### Example 2: Weekend Special Content

Show different content on weekends:

```javascript
{
  file: '200',
  priority: 10,
  fromdt: '2025-01-30T10:00:00Z',
  todt: '2025-01-30T18:00:00Z',
  recurrenceType: 'Week',
  recurrenceRepeatsOn: '6,7' // Sat-Sun
}
```

### Example 3: Lunch Promotions (Mon/Wed/Fri)

Show lunch menu on specific days:

```javascript
{
  file: '300',
  priority: 10,
  fromdt: '2025-01-30T12:00:00Z',
  todt: '2025-01-30T14:00:00Z',
  recurrenceType: 'Week',
  recurrenceRepeatsOn: '1,3,5' // Mon, Wed, Fri
}
```

### Example 4: Night Mode (Midnight Crossing)

Show dim content at night (handles midnight crossing):

```javascript
{
  file: '400',
  priority: 10,
  fromdt: '2025-01-30T22:00:00Z',  // 10 PM
  todt: '2025-01-30T06:00:00Z',    // 6 AM
  recurrenceType: 'Week',
  recurrenceRepeatsOn: '1,2,3,4,5,6,7' // Every day
}
```

### Example 5: Campaign with Dayparting

Recurring campaign with multiple layouts:

```javascript
{
  id: '1',
  priority: 10,
  fromdt: '2025-01-30T09:00:00Z',
  todt: '2025-01-30T17:00:00Z',
  recurrenceType: 'Week',
  recurrenceRepeatsOn: '1,2,3,4,5',
  layouts: [
    { file: '100' },
    { file: '101' },
    { file: '102' }
  ]
}
```

### Example 6: Limited Duration Recurrence

Recurring schedule that ends at year-end:

```javascript
{
  file: '500',
  priority: 10,
  fromdt: '2025-01-30T09:00:00Z',
  todt: '2025-01-30T17:00:00Z',
  recurrenceType: 'Week',
  recurrenceRepeatsOn: '1,2,3,4,5',
  recurrenceRange: '2025-12-31T23:59:59Z' // Ends at year-end
}
```

## Priority Behavior

Dayparting schedules follow the same priority rules as regular schedules:
- Higher priority schedules override lower priority ones
- Multiple schedules at the same priority are all active
- Priority applies at campaign level (all layouts in campaign share priority)

## Backward Compatibility

Non-recurring schedules continue to work as before:
- If `recurrenceType` is not specified, schedule uses full date/time ranges
- Existing schedules are unaffected by dayparting implementation
- All existing tests continue to pass

## Testing

Two test suites verify functionality:

1. **Campaign Tests** (`schedule.test.js`): Existing tests for campaigns and priorities
2. **Dayparting Tests** (`schedule.dayparting.test.js`): New tests for recurring schedules

Run tests:
```bash
cd packages/core
node src/schedule.test.js
node src/schedule.dayparting.test.js
```

## Implementation Details

### Methods Added

1. **`isRecurringScheduleActive(item, now)`**
   - Checks if current day matches `recurrenceRepeatsOn`
   - Validates `recurrenceRange` if specified
   - Returns `true` if schedule should be evaluated

2. **`getIsoDayOfWeek(date)`**
   - Converts JavaScript day (0=Sunday) to ISO day (1=Monday)
   - Used for day-of-week matching

3. **`isTimeActive(item, now)`**
   - For recurring schedules: matches time-of-day
   - For non-recurring: matches full date/time range
   - Handles midnight crossing for recurring schedules

### Changes to `getCurrentLayouts()`

The main scheduling method now:
1. Checks if schedule is a recurring schedule
2. Validates day-of-week match for recurring schedules
3. Uses time-of-day matching for recurring schedules
4. Falls back to date/time matching for non-recurring schedules

## Future Enhancements

Potential additions:
- Support for other `recurrenceType` values (Day, Month, Year)
- Support for `recurrenceDetail` (e.g., every 2 weeks)
- Daypart exceptions (different times on specific days)
- Monthly recurrence patterns

## References

- Xibo CMS Schedule Entity: https://github.com/xibosignage/xibo-cms/blob/develop/lib/Entity/Schedule.php
- Xibo Dayparting Documentation: https://account.xibosignage.com/manual/en/scheduling_dayparting
- ISO 8601 Day of Week: https://en.wikipedia.org/wiki/ISO_8601#Week_dates
