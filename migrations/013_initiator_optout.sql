-- Migration 013 — the combined role becomes Project Lead ONLY
-- SAFE for your data: removes one role label from members who also hold
-- Project Lead. No membership row, idea, or account is deleted.
--
-- Migration 012 turned "Initiator / Project Lead" into BOTH roles, so existing
-- ideas showed two roles against one person. The intent was simpler: the old
-- combined role is just Project Lead, and Initiator is a new role people can
-- take on if they want it.
--
-- Only strips Initiator where the same person is also the Project Lead — which
-- is exactly the pair 012 created. An Initiator deliberately assigned to
-- somebody who is not the lead is left alone.

update idea_members
set roles = array_remove(roles, 'Initiator')
where roles @> array['Initiator'] and roles @> array['Project Lead'];
