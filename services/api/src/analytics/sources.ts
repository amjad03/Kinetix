import { sql } from 'drizzle-orm';

/**
 * The placement and research figures come from the domain tables (placements: migrations 0067-0070, research: 0071-0072), not from a copy kept for analytics.
 * Each fragment is a derived table with one row per offer or output, shaped for the KPI, catalogue and accreditation queries.
 */

/** Placement offers: `p.student_id`, `p.company`, `p.role`, `p.package_paise` (yearly CTC), `p.offered_on` and `p.status` (offered | joined | declined | withdrawn | expired). */
export const placementOffersSql = sql`(
  select po.id, po.student_id, c.name as company, po.role_title as role,
         round(coalesce(po.ctc_lpa, 0) * 10000000)::bigint as package_paise, po.offered_on,
         case po.status when 'accepted' then 'joined' else po.status end as status
  from placement_offers po join placement_drives d on d.id = po.drive_id join placement_companies c on c.id = d.company_id
) p`;

/** Offers still standing: made, or accepted. */
export const LIVE_OFFER = sql`p.status in ('offered', 'joined')`;

/**
 * Research outputs: `r.kind` (paper | book | patent | project | conference), `r.title`, `r.venue`, `r.staff_user_id`, `r.published_on` and `r.grant_paise`.
 * Journal articles are papers, book chapters count as books, patents and other IP by filing or grant date, and presented or organised conferences (not already a publication) as conferences.
 * A research project carries the grants sanctioned to it.
 */
export const researchOutputsSql = sql`(
  select pub.id, case pub.kind when 'journal' then 'paper' when 'conference' then 'conference' else 'book' end as kind, pub.title, pub.venue,
         pub.owner_user_id as staff_user_id, make_date(pub.year::int, 1, 1) as published_on, 0::bigint as grant_paise
  from publications pub
  union all
  select pt.id, 'patent', pt.title, coalesce(pt.application_no, ''), pt.owner_user_id, coalesce(pt.granted_on, pt.filed_on), 0
  from patents pt where coalesce(pt.granted_on, pt.filed_on) is not null
  union all
  select cf.id, 'conference', coalesce(cf.paper_title, cf.name), cf.name, cf.user_id, cf.held_on, 0
  from conferences cf where cf.role in ('presented', 'organised') and cf.publication_id is null
  union all
  select rp.id, 'project', rp.title, coalesce(rp.sponsor_org, ''), rp.pi_user_id, rp.starts_on,
         coalesce((select sum(g.sanctioned_paise) from research_grants g where g.project_id = rp.id and g.status <> 'cancelled'), 0)
  from research_projects rp where rp.status <> 'cancelled'
) r`;
