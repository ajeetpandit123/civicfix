# Responsibility routing

**Area responsibility** (who owns a category in a place) is not the same as **complaint assignment** (who is working this ticket).

Flow:

1. Validate lat/lng ranges.
2. Find active areas whose bounding box contains the point; pick the **smallest** area to reduce overlap mistakes.
3. Look up `ResponsibilityMapping` for `(area, category)`.
4. If found: set jurisdiction + department, status `UNDER_REVIEW`, notify officers in that department/jurisdiction.
5. If not: status `ROUTING_PENDING`, citizen message that authority is not configured, notify admins. **No person is invented.**

Default officer/team on a mapping is configuration for later assignment, not an automatic personal assignment on create.

Admins edit mappings at `/admin/responsibility`.
