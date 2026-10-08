import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import AppRegistrationOutlined from '@mui/icons-material/AppRegistrationOutlined';
import AltRouteOutlined from '@mui/icons-material/AltRouteOutlined';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import SettingsRemoteOutlined from '@mui/icons-material/SettingsRemoteOutlined';
import ClassOutlined from '@mui/icons-material/ClassOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import DirectionsBusOutlined from '@mui/icons-material/DirectionsBusOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import FolderCopyOutlined from '@mui/icons-material/FolderCopyOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HotelOutlined from '@mui/icons-material/HotelOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LiveTvOutlined from '@mui/icons-material/LiveTvOutlined';
import LocalLibraryOutlined from '@mui/icons-material/LocalLibraryOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import OndemandVideoOutlined from '@mui/icons-material/OndemandVideoOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import QrCode2Outlined from '@mui/icons-material/QrCode2Outlined';
import QuizOutlined from '@mui/icons-material/QuizOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import RequestQuoteOutlined from '@mui/icons-material/RequestQuoteOutlined';
import RestaurantOutlined from '@mui/icons-material/RestaurantOutlined';
import BusinessCenterOutlined from '@mui/icons-material/BusinessCenterOutlined';
import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import ReportProblemOutlined from '@mui/icons-material/ReportProblemOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import TrackChangesOutlined from '@mui/icons-material/TrackChangesOutlined';
import PollOutlined from '@mui/icons-material/PollOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import WorkOutlineOutlined from '@mui/icons-material/WorkOutlineOutlined';
import Diversity3Outlined from '@mui/icons-material/Diversity3Outlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import WorkspacePremiumOutlined from '@mui/icons-material/WorkspacePremiumOutlined';
import VideoLibraryOutlined from '@mui/icons-material/VideoLibraryOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import type { NavIcon } from '@/lib/nav';

export const NAV_ICONS: Record<NavIcon, SvgIconComponent> = {
  dashboard: DashboardOutlined,
  admissions: HowToRegOutlined,
  students: GroupsOutlined,
  academics: SchoolOutlined,
  timetable: CalendarMonthOutlined,
  attendance: FactCheckOutlined,
  exams: QuizOutlined,
  obe: TrackChangesOutlined,
  lms: CastForEducationOutlined,
  finance: PaymentsOutlined,
  hr: BadgeOutlined,
  library: LocalLibraryOutlined,
  campus: DirectionsBusOutlined,
  inventory: Inventory2Outlined,
  communication: CampaignOutlined,
  reports: InsightsOutlined,
  settings: SettingsOutlined,
  classes: ClassOutlined,
  calendar: EventNoteOutlined,
  homework: AssignmentOutlined,
  results: GradingOutlined,
  boards: CastForEducationOutlined,
  devices: SettingsRemoteOutlined,
  live: LiveTvOutlined,
  topicVideos: VideoLibraryOutlined,
  syllabus: MenuBookOutlined,
  departments: AccountTreeOutlined,
  documents: FolderCopyOutlined,
  payroll: RequestQuoteOutlined,
  payslips: ReceiptLongOutlined,
  transport: DirectionsBusOutlined,
  hostel: HotelOutlined,
  canteen: RestaurantOutlined,
  campusLife: Diversity3Outlined,
  skills: WorkspacePremiumOutlined,
  placements: BusinessCenterOutlined,
  research: ScienceOutlined,
  grievances: ReportProblemOutlined,
  mentoring: GroupsOutlined,
  courseFiles: FolderCopyOutlined,
  academicAudit: FactCheckOutlined,
  questionBank: QuizOutlined,
  assets: QrCode2Outlined,
  messages: CampaignOutlined,
  conversations: ForumOutlined,
  ai: AutoAwesomeOutlined,
  department: InsightsOutlined,
  import: UploadFileOutlined,
  surveys: PollOutlined,
  tasks: TaskAltOutlined,
  workflows: AltRouteOutlined,
  work: WorkOutlineOutlined,
  courseRegistration: AppRegistrationOutlined,
  platform: OndemandVideoOutlined,
};
