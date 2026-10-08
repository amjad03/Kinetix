// Types for the campus-life desk (clubs, committees, events): what v1/campus-life sends.

export interface Club { id: string; name: string; category: string; description: string; facultyCoordinatorId: string | null; active: boolean; members: number; pending: number }
export interface ClubMember { id: string; studentId: string; fullName: string; rollNo: string; role: 'member' | 'lead'; status: 'requested' | 'active' | 'rejected' | 'left'; points: number }
export interface ClubActivity { id: string; title: string; activityOn: string; points: number; attended: number }

export interface Committee { id: string; name: string; statutory: boolean; description: string; active: boolean; members: number; openActions: number }
export interface CommitteeMember { id: string; userId: string; fullName: string; role: string; tenureStart: string; tenureEnd: string | null; current: boolean }
export interface Meeting { id: string; title: string; meetingOn: string; agenda: string; minutes: string; status: 'scheduled' | 'held' | 'cancelled'; actions: number; openActions: number }
export interface ActionItem { id: string; title: string; ownerName: string; dueOn: string; status: 'open' | 'in_progress' | 'done' | 'dropped'; overdue: boolean }

export interface CampusEvent { id: string; title: string; description: string; eventType: string; venue: string; capacity: number; startsAt: string; endsAt: string; audience: string; feePaise: number; status: 'draft' | 'published' | 'cancelled'; registered: number; waitlisted: number; checkedIn: number }
export interface EventRegistration { id: string; fullName: string; rollNo: string; status: 'registered' | 'waitlisted' | 'cancelled'; checkedInAt: string | null }
export interface EventSummary { registered: number; waitlisted: number; attended: number; attendancePercent: number; expectedFeePaise: number; feedbackCount: number; averageRating: number | null }

export const CLUB_CATEGORIES = ['academic', 'cultural', 'sports', 'service', 'technical', 'general'] as const;
export const EVENT_TYPES = ['seminar', 'workshop', 'parent_meeting', 'fest', 'sports', 'competition', 'conference', 'alumni', 'other'] as const;
export const AUDIENCES = ['all', 'students', 'parents', 'staff'] as const;
export const COMMITTEE_ROLES = ['chair', 'secretary', 'member', 'external'] as const;
export const ACTION_STATUSES = ['open', 'in_progress', 'done', 'dropped'] as const;
