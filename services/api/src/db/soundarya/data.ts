/** Static content of the Soundarya demo: programmes, NEP papers, people's names. All people are fictional. */

/** Which demo institution to build: the Soundarya college (default) or the K-12 school (SEED_PROFILE=school). */
export const PROFILE: 'college' | 'school' = process.env.SEED_PROFILE === 'school' ? 'school' : 'college';
export const PASSWORD = 'zynetix123';

export type Dept = 'Management Studies' | 'Commerce' | 'Computer Applications' | 'Aviation Studies' | 'Languages' | 'Mathematics and Statistics';
export const DEPARTMENTS: Dept[] = ['Management Studies', 'Commerce', 'Computer Applications', 'Aviation Studies', 'Languages', 'Mathematics and Statistics'];

export interface ProgramDef {
  code: string;
  name: string;
  level: 'ug' | 'pg' | 'k12';
  terms: number;
  /** Semester fee in rupees. */
  feeInr: number;
  dept: Dept;
  /** Sections for odd semesters: [term, size, number of sections (default 1)]. */
  classes: [number, number, number?][];
  /** Students of this programme who live in the hostel (percent). */
  papers: Record<number, [string, number, Dept?][]>;
}

const L1: [string, number, Dept] = ['Kannada / Hindi (Language I)', 3, 'Languages'];
const L2: [string, number, Dept] = ['English (Language II)', 3, 'Languages'];
const DF: [string, number, Dept] = ['Digital Fluency', 2, 'Computer Applications'];
const CI: [string, number, Dept] = ['Constitution of India', 2, 'Languages'];
const L3: [string, number, Dept] = ['English III: Professional Communication', 3, 'Languages'];

const C_PROGRAMS: ProgramDef[] = [
  {
    code: 'BBA', name: 'BBA', level: 'ug', terms: 6, feeInr: 42000, dept: 'Management Studies',
    classes: [[1, 30], [3, 28], [5, 24]],
    papers: {
      1: [['Principles of Management', 4], ['Financial Accounting', 4, 'Commerce'], ['Business Mathematics', 4, 'Mathematics and Statistics'], L1, L2, DF],
      3: [['Business Statistics', 4, 'Mathematics and Statistics'], ['Cost Accounting', 4, 'Commerce'], ['Marketing Management', 4], ['Human Resource Management', 4], L3, CI],
      5: [['Financial Management', 4], ['Operations Management', 4], ['Entrepreneurship Development', 3], ['Business Analytics', 3, 'Mathematics and Statistics'], ['Banking and Insurance', 3, 'Commerce'], ['Internship and Project Report', 4]],
    },
  },
  {
    code: 'BCM', name: 'BCom', level: 'ug', terms: 6, feeInr: 32000, dept: 'Commerce',
    classes: [[1, 32], [3, 30], [5, 26]],
    papers: {
      1: [['Financial Accounting I', 4], ['Business Law', 4], ['Principles of Marketing', 4, 'Management Studies'], L1, L2, DF],
      3: [['Corporate Accounting', 4], ['Cost Accounting', 4], ['Financial Management', 4], ['Indian Financial System', 4], L3, CI],
      5: [['Income Tax Law and Practice', 4], ['Auditing and Assurance', 4], ['Management Accounting', 4], ['Goods and Services Tax', 3], ['Banking Operations', 3], ['Internship and Project Report', 4]],
    },
  },
  {
    code: 'BCA', name: 'BCA', level: 'ug', terms: 6, feeInr: 41000, dept: 'Computer Applications',
    classes: [[1, 26], [3, 24], [5, 20]],
    papers: {
      1: [['Problem Solving Techniques using C', 4], ['Discrete Mathematics', 4, 'Mathematics and Statistics'], ['Computer Architecture', 4], L1, L2, DF],
      3: [['Data Structures', 4], ['Database Management Systems', 4], ['Object Oriented Programming with Java', 4], ['Computer Networks', 4], L3, CI],
      5: [['Web Technologies', 4], ['Software Engineering', 4], ['Python Programming', 4], ['Cloud Computing', 3], ['Cyber Security', 3], ['Project Work', 4]],
    },
  },
  {
    code: 'BAV', name: 'BBA Aviation', level: 'ug', terms: 6, feeInr: 85000, dept: 'Aviation Studies',
    classes: [[1, 14], [3, 12]],
    papers: {
      1: [['Introduction to Aviation Industry', 4], ['Airport Operations', 4], ['Principles of Management', 4, 'Management Studies'], ['Communication Skills', 3, 'Languages'], L1, DF],
      3: [['Airline Ground Handling', 4], ['Aviation Safety and Security', 4], ['Air Cargo Management', 4], ['Customer Service in Aviation', 3], ['Aviation Geography and Meteorology', 3], CI],
    },
  },
  {
    code: 'MBA', name: 'MBA', level: 'pg', terms: 4, feeInr: 75000, dept: 'Management Studies',
    classes: [[1, 18], [3, 16]],
    papers: {
      1: [['Management Concepts and Organisational Behaviour', 4], ['Managerial Economics', 4, 'Commerce'], ['Accounting for Managers', 4, 'Commerce'], ['Business Statistics', 4, 'Mathematics and Statistics'], ['Marketing Management', 4], ['Business Communication', 2, 'Languages']],
      3: [['Strategic Management', 4], ['Entrepreneurship and Venture Creation', 3], ['Consumer Behaviour', 4], ['Digital Marketing', 4], ['Security Analysis and Portfolio Management', 4, 'Commerce'], ['Talent Management', 4]],
    },
  },
  {
    code: 'MCM', name: 'MCom', level: 'pg', terms: 4, feeInr: 38000, dept: 'Commerce',
    classes: [[1, 12], [3, 10]],
    papers: {
      1: [['Advanced Financial Accounting', 4], ['Managerial Economics', 4], ['Quantitative Techniques', 4, 'Mathematics and Statistics'], ['Organisational Behaviour', 4, 'Management Studies'], ['Research Methodology', 3], ['Cyber Security Awareness', 2, 'Computer Applications']],
      3: [['Advanced Cost Management', 4], ['Strategic Management', 4, 'Management Studies'], ['Direct Tax Planning', 4], ['Financial Derivatives', 4], ['Corporate Governance', 3], ['Dissertation', 4]],
    },
  },
];

export const MALE = ['Aarav', 'Adithya', 'Akash', 'Arjun', 'Bharath', 'Chandan', 'Darshan', 'Deepak', 'Dhruv', 'Ganesh', 'Harish', 'Ishaan', 'Jagadish', 'Karthik', 'Kiran', 'Lokesh', 'Manoj', 'Mohan', 'Naveen', 'Nikhil', 'Pranav', 'Prashanth', 'Rahul', 'Rakesh', 'Rohan', 'Sachin', 'Sandeep', 'Shreyas', 'Suraj', 'Tejas', 'Varun', 'Vignesh', 'Vinay', 'Vishal', 'Yashwanth', 'Mohammed', 'Imran', 'Joseph', 'Abhishek', 'Santosh'];
export const FEMALE = ['Aishwarya', 'Ananya', 'Anusha', 'Bhavana', 'Chaitra', 'Deepika', 'Divya', 'Gayathri', 'Harshitha', 'Ishita', 'Jyothi', 'Kavya', 'Keerthi', 'Lakshmi', 'Meghana', 'Nandini', 'Nisha', 'Pooja', 'Prathibha', 'Priya', 'Rachana', 'Rashmi', 'Sahana', 'Shilpa', 'Shruthi', 'Spandana', 'Sushmitha', 'Swathi', 'Tanvi', 'Usha', 'Varsha', 'Vidya', 'Yamini', 'Zainab', 'Fathima', 'Sneha', 'Pallavi', 'Mamatha', 'Rakshitha', 'Trisha'];
export const SURNAMES = ['Gowda', 'Shetty', 'Hegde', 'Bhat', 'Naik', 'Rao', 'Reddy', 'Murthy', 'Kulkarni', 'Patil', 'Desai', 'Joshi', 'Acharya', 'Kamath', 'Pai', 'Prabhu', 'Nair', 'Menon', 'Iyer', 'Sharma', 'Khan', 'Fernandes', 'Shenoy', 'Poojary', 'Kumar', 'Swamy', 'Rajan', 'Hiremath', 'Bangera', 'Urs', 'Narayan', 'Raju', 'Nayak', 'Gupta', 'Ahmed', 'Mathew', 'Lobo', 'Biradar', 'Chandra', 'Setty'];

/** Staff: name, role(s), department. The first block are non-teaching or administrative. */
export interface StaffDef {
  name: string;
  email: string;
  roles: string[];
  dept?: Dept;
  designation: string;
  gender: 'female' | 'male';
  lang?: 'en' | 'hi' | 'kn';
  /** Basic monthly pay in rupees. */
  basic: number;
}
const C_STAFF: StaffDef[] = [
  { name: 'Dr. Savitha Hegde', email: 'principal', roles: ['principal'], designation: 'Principal', gender: 'female', basic: 95000, lang: 'en' },
  { name: 'Mahesh Gowda', email: 'admin', roles: ['tenant_admin'], designation: 'Administrative Officer', gender: 'male', basic: 52000, lang: 'kn' },
  { name: 'Rekha Shenoy', email: 'accounts', roles: ['accountant'], designation: 'Accounts Manager', gender: 'female', basic: 48000 },
  { name: 'Suresh Kamath', email: 'library', roles: ['librarian'], designation: 'Librarian', gender: 'male', basic: 42000 },
  { name: 'Anitha Rajan', email: 'hr', roles: ['hr_manager'], designation: 'HR Manager', gender: 'female', basic: 55000 },
  { name: 'Dr. Meenakshi Iyer', email: 'counsellor', roles: ['counsellor'], designation: 'College Counsellor', gender: 'female', basic: 46000 },
  { name: 'Prakash Naik', email: 'admissions', roles: ['admissions_officer'], designation: 'Admissions Officer', gender: 'male', basic: 38000 },
  { name: 'Vinutha Reddy', email: 'placements', roles: ['placement_officer'], designation: 'Placement Officer', gender: 'female', basic: 50000 },
  { name: 'Ramesh Poojary', email: 'warden', roles: ['hostel_warden'], designation: 'Hostel Warden', gender: 'male', basic: 30000 },
  { name: 'Shivanna Biradar', email: 'transport', roles: ['transport_manager'], designation: 'Transport Manager', gender: 'male', basic: 34000 },
  { name: 'Lakshmamma Setty', email: 'stores', roles: ['store_keeper'], designation: 'Store Keeper', gender: 'female', basic: 26000 },
  { name: 'Dr. Ibrahim Khan', email: 'grievance', roles: ['grievance_officer', 'icc_member'], designation: 'Grievance Officer', gender: 'male', basic: 58000 },
  { name: 'Prof. Ramakrishna Bhat', email: 'controller', roles: ['exam_controller'], designation: 'Controller of Examinations', gender: 'male', basic: 76000 },
  { name: 'Dr. Usha Kulkarni', email: 'iqac', roles: ['quality_officer'], designation: 'IQAC Coordinator', gender: 'female', basic: 74000 },
  { name: 'Dr. Shobha Pai', email: 'research', roles: ['research_coordinator'], designation: 'Research Coordinator', gender: 'female', basic: 72000, dept: 'Commerce' },
  { name: 'Manjunath Urs', email: 'driver1', roles: ['driver'], designation: 'Bus Driver', gender: 'male', basic: 22000 },
  { name: 'Thimmappa Nayak', email: 'driver2', roles: ['driver'], designation: 'Bus Driver', gender: 'male', basic: 22000 },
  { name: 'Canteen Office', email: 'canteen', roles: ['canteen_manager'], designation: 'Canteen Manager', gender: 'male', basic: 24000 },
  // Heads of department (teach too)
  { name: 'Dr. Raghavendra Prabhu', email: 'hod.management', roles: ['teacher', 'hod'], dept: 'Management Studies', designation: 'Professor and HoD', gender: 'male', basic: 88000 },
  { name: 'Dr. Kavitha Murthy', email: 'hod.commerce', roles: ['teacher', 'hod'], dept: 'Commerce', designation: 'Professor and HoD', gender: 'female', basic: 86000 },
  { name: 'Dr. Srinivas Rao', email: 'hod.computers', roles: ['teacher', 'hod'], dept: 'Computer Applications', designation: 'Professor and HoD', gender: 'male', basic: 84000 },
  { name: 'Capt. Vikram Menon', email: 'hod.aviation', roles: ['teacher', 'hod'], dept: 'Aviation Studies', designation: 'Associate Professor and HoD', gender: 'male', basic: 78000 },
  { name: 'Dr. Padmavathi Joshi', email: 'hod.languages', roles: ['teacher', 'hod'], dept: 'Languages', designation: 'Associate Professor and HoD', gender: 'female', basic: 74000, lang: 'kn' },
  { name: 'Dr. Narasimha Kulkarni', email: 'hod.maths', roles: ['teacher', 'hod'], dept: 'Mathematics and Statistics', designation: 'Professor and HoD', gender: 'male', basic: 82000 },
  // Management Studies
  { name: 'Prof. Deepa Nair', email: 'deepa.nair', roles: ['teacher'], dept: 'Management Studies', designation: 'Assistant Professor', gender: 'female', basic: 58000 },
  { name: 'Prof. Arvind Shetty', email: 'arvind.shetty', roles: ['teacher'], dept: 'Management Studies', designation: 'Assistant Professor', gender: 'male', basic: 56000 },
  { name: 'Prof. Shalini Desai', email: 'shalini.desai', roles: ['teacher'], dept: 'Management Studies', designation: 'Associate Professor', gender: 'female', basic: 64000 },
  { name: 'Prof. Girish Patil', email: 'girish.patil', roles: ['teacher'], dept: 'Management Studies', designation: 'Assistant Professor', gender: 'male', basic: 55000 },
  { name: 'Prof. Nalini Bhat', email: 'nalini.bhat', roles: ['teacher'], dept: 'Management Studies', designation: 'Assistant Professor', gender: 'female', basic: 54000 },
  // Commerce
  { name: 'Prof. Harini Acharya', email: 'harini.acharya', roles: ['teacher'], dept: 'Commerce', designation: 'Assistant Professor', gender: 'female', basic: 57000 },
  { name: 'Prof. Sudhir Kamath', email: 'sudhir.kamath', roles: ['teacher'], dept: 'Commerce', designation: 'Associate Professor', gender: 'male', basic: 66000 },
  { name: 'Prof. Latha Gowda', email: 'latha.gowda', roles: ['teacher'], dept: 'Commerce', designation: 'Assistant Professor', gender: 'female', basic: 55000 },
  { name: 'Prof. Mohan Hiremath', email: 'mohan.hiremath', roles: ['teacher'], dept: 'Commerce', designation: 'Assistant Professor', gender: 'male', basic: 54000 },
  { name: 'Prof. Rukmini Pai', email: 'rukmini.pai', roles: ['teacher'], dept: 'Commerce', designation: 'Assistant Professor', gender: 'female', basic: 53000 },
  { name: 'Prof. Anand Bangera', email: 'anand.bangera', roles: ['teacher'], dept: 'Commerce', designation: 'Assistant Professor', gender: 'male', basic: 52000 },
  // Computer Applications
  { name: 'Prof. Sowmya Reddy', email: 'sowmya.reddy', roles: ['teacher'], dept: 'Computer Applications', designation: 'Associate Professor', gender: 'female', basic: 65000 },
  { name: 'Prof. Tarun Swamy', email: 'tarun.swamy', roles: ['teacher'], dept: 'Computer Applications', designation: 'Assistant Professor', gender: 'male', basic: 56000 },
  { name: 'Prof. Bhuvana Narayan', email: 'bhuvana.narayan', roles: ['teacher'], dept: 'Computer Applications', designation: 'Assistant Professor', gender: 'female', basic: 55000 },
  { name: 'Prof. Faisal Ahmed', email: 'faisal.ahmed', roles: ['teacher'], dept: 'Computer Applications', designation: 'Assistant Professor', gender: 'male', basic: 54000 },
  { name: 'Prof. Chandrika Rao', email: 'chandrika.rao', roles: ['teacher'], dept: 'Computer Applications', designation: 'Assistant Professor', gender: 'female', basic: 52000 },
  // Aviation
  { name: 'Prof. Lavanya Fernandes', email: 'lavanya.fernandes', roles: ['teacher'], dept: 'Aviation Studies', designation: 'Assistant Professor', gender: 'female', basic: 56000 },
  { name: 'Prof. Rohit Lobo', email: 'rohit.lobo', roles: ['teacher'], dept: 'Aviation Studies', designation: 'Assistant Professor', gender: 'male', basic: 55000 },
  // Languages
  { name: 'Prof. Vasudha Murthy', email: 'vasudha.murthy', roles: ['teacher'], dept: 'Languages', designation: 'Assistant Professor', gender: 'female', basic: 52000, lang: 'kn' },
  { name: 'Prof. Rajiv Sharma', email: 'rajiv.sharma', roles: ['teacher'], dept: 'Languages', designation: 'Assistant Professor', gender: 'male', basic: 52000, lang: 'hi' },
  { name: 'Prof. Esther Mathew', email: 'esther.mathew', roles: ['teacher'], dept: 'Languages', designation: 'Assistant Professor', gender: 'female', basic: 53000 },
  // Mathematics and Statistics
  { name: 'Prof. Jayashree Hegde', email: 'jayashree.hegde', roles: ['teacher'], dept: 'Mathematics and Statistics', designation: 'Assistant Professor', gender: 'female', basic: 55000 },
  { name: 'Prof. Kishore Chandra', email: 'kishore.chandra', roles: ['teacher'], dept: 'Mathematics and Statistics', designation: 'Assistant Professor', gender: 'male', basic: 54000 },
];

/** Which logins are shown in the logins document (email prefixes). */
const C_LOGIN_STAFF = ['principal', 'admin', 'accounts', 'library', 'hr', 'counsellor', 'controller', 'iqac', 'hod.commerce', 'hod.computers', 'deepa.nair', 'sudhir.kamath', 'sowmya.reddy'];

// ---------------------------------------------------------------------------------------------
// K-12 school profile (SEED_PROFILE=school): Sri Vidya Niketan Public School, CBSE, Bengaluru.
// Departments reuse the college's internal keys and are renamed after seeding (SCHOOL_DEPT_NAMES).
// Programmes are school stages; the term number is the class (1 to 12).
// ---------------------------------------------------------------------------------------------
export const SCHOOL_DEPT_NAMES: Record<Dept, string> = {
  'Aviation Studies': 'Science',
  'Mathematics and Statistics': 'Mathematics',
  Languages: 'Languages',
  'Management Studies': 'Social Science',
  'Computer Applications': 'Computer Science',
  Commerce: 'Commerce',
};
type Paper = [string, number, Dept?];
const SC: Dept = 'Aviation Studies';
const MA: Dept = 'Mathematics and Statistics';
const LA: Dept = 'Languages';
const SS: Dept = 'Management Studies';
const CS: Dept = 'Computer Applications';
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const papersFor = (classes: number[], f: (c: number) => Paper[]) => Object.fromEntries(classes.map((c) => [c, f(c)]));
const S_PROGRAMS: ProgramDef[] = [
  {
    code: 'PRI', name: 'Primary', level: 'k12', terms: 5, feeInr: 28000, dept: LA,
    classes: [[1, 20, 2], [2, 20, 2], [3, 20, 2], [4, 20, 2], [5, 20, 2]],
    papers: papersFor(range(1, 5), (c) => [['English', 7, LA], ['Kannada', 5, LA], ...(c >= 3 ? [['Hindi', 3, LA] as Paper] : []), ['Mathematics', 7, MA], ['Environmental Studies', 5, SC], ['Computer Basics', 2, CS]]),
  },
  {
    code: 'MID', name: 'Middle School', level: 'k12', terms: 8, feeInr: 34000, dept: SS,
    classes: [[6, 20, 2], [7, 20, 2], [8, 20, 2]],
    papers: papersFor(range(6, 8), () => [['English', 5, LA], ['Kannada', 4, LA], ['Hindi', 3, LA], ['Mathematics', 6, MA], ['Science', 6, SC], ['Social Science', 5, SS], ['Computer Science', 2, CS]]),
  },
  {
    code: 'SEC', name: 'Secondary', level: 'k12', terms: 10, feeInr: 38000, dept: SC,
    classes: [[9, 22, 2], [10, 22, 2]],
    papers: papersFor(range(9, 10), () => [['English', 5, LA], ['Kannada', 4, LA], ['Hindi', 3, LA], ['Mathematics', 6, MA], ['Science', 6, SC], ['Social Science', 5, SS], ['Information Technology', 2, CS]]),
  },
  {
    code: 'SCI', name: 'Senior Secondary Science', level: 'k12', terms: 12, feeInr: 52000, dept: SC,
    classes: [[11, 24], [12, 22]],
    papers: papersFor(range(11, 12), () => [['English', 4, LA], ['Physics', 6, SC], ['Chemistry', 6, SC], ['Mathematics', 6, MA], ['Biology', 5, SC], ['Computer Science', 4, CS]]),
  },
  {
    code: 'COM', name: 'Senior Secondary Commerce', level: 'k12', terms: 12, feeInr: 46000, dept: 'Commerce',
    classes: [[11, 22], [12, 20]],
    papers: papersFor(range(11, 12), () => [['English', 4, LA], ['Accountancy', 6, 'Commerce'], ['Business Studies', 6, 'Commerce'], ['Economics', 6, SS], ['Applied Mathematics', 5, MA], ['Informatics Practices', 4, CS]]),
  },
];
const S_STAFF: StaffDef[] = [
  { name: 'Mrs. Lalitha Raghavan', email: 'principal', roles: ['principal'], designation: 'Principal', gender: 'female', basic: 90000 },
  { name: 'Venkatesh Murthy', email: 'admin', roles: ['tenant_admin'], designation: 'Administrative Officer', gender: 'male', basic: 48000, lang: 'kn' },
  { name: 'Geetha Shenoy', email: 'accounts', roles: ['accountant'], designation: 'Accounts Officer', gender: 'female', basic: 42000 },
  { name: 'Sunil Kamath', email: 'library', roles: ['librarian'], designation: 'Librarian', gender: 'male', basic: 36000 },
  { name: 'Asha Rajan', email: 'hr', roles: ['hr_manager'], designation: 'HR Executive', gender: 'female', basic: 45000 },
  { name: 'Ms. Nirmala Iyer', email: 'counsellor', roles: ['counsellor', 'placement_officer'], designation: 'School Counsellor', gender: 'female', basic: 42000 },
  { name: 'Pradeep Naik', email: 'admissions', roles: ['admissions_officer'], designation: 'Admissions Officer', gender: 'male', basic: 34000 },
  { name: 'Mr. Gopal Hegde', email: 'controller', roles: ['exam_controller'], designation: 'Examination In-charge', gender: 'male', basic: 62000 },
  { name: 'Mrs. Shantala Kulkarni', email: 'coordinator', roles: ['quality_officer', 'research_coordinator'], designation: 'Academic Coordinator', gender: 'female', basic: 66000 },
  { name: 'Ravi Poojary', email: 'warden', roles: ['hostel_warden'], designation: 'Hostel Warden', gender: 'male', basic: 28000 },
  { name: 'Basavaraj Biradar', email: 'transport', roles: ['transport_manager'], designation: 'Transport In-charge', gender: 'male', basic: 32000 },
  { name: 'Kamala Setty', email: 'stores', roles: ['store_keeper'], designation: 'Store Keeper', gender: 'female', basic: 24000 },
  { name: 'Mr. Imran Khan', email: 'grievance', roles: ['grievance_officer', 'icc_member'], designation: 'Grievance and POCSO Officer', gender: 'male', basic: 52000 },
  { name: 'Nagaraj Urs', email: 'driver1', roles: ['driver'], designation: 'Bus Driver', gender: 'male', basic: 21000 },
  { name: 'Siddappa Nayak', email: 'driver2', roles: ['driver'], designation: 'Bus Driver', gender: 'male', basic: 21000 },
  { name: 'Canteen Office', email: 'canteen', roles: ['canteen_manager'], designation: 'Canteen Manager', gender: 'male', basic: 22000 },
  // Heads of department (teach too)
  { name: 'Dr. Meera Kulkarni', email: 'hod.science', roles: ['teacher', 'hod'], dept: SC, designation: 'Head of Department (PGT)', gender: 'female', basic: 72000 },
  { name: 'Mr. Prakash Rao', email: 'hod.maths', roles: ['teacher', 'hod'], dept: MA, designation: 'Head of Department (PGT)', gender: 'male', basic: 70000 },
  { name: 'Mrs. Padma Joshi', email: 'hod.languages', roles: ['teacher', 'hod'], dept: LA, designation: 'Head of Department (PGT)', gender: 'female', basic: 66000, lang: 'kn' },
  { name: 'Mr. Anil Prabhu', email: 'hod.social', roles: ['teacher', 'hod'], dept: SS, designation: 'Head of Department (PGT)', gender: 'male', basic: 66000 },
  { name: 'Mrs. Sujatha Rao', email: 'hod.computers', roles: ['teacher', 'hod'], dept: CS, designation: 'Head of Department (PGT)', gender: 'female', basic: 64000 },
  { name: 'Mr. Ramesh Bhat', email: 'hod.commerce', roles: ['teacher', 'hod'], dept: 'Commerce', designation: 'Head of Department (PGT)', gender: 'male', basic: 64000 },
  // Science
  { name: 'Mrs. Kavya Shetty', email: 'kavya.shetty', roles: ['teacher'], dept: SC, designation: 'Trained Graduate Teacher', gender: 'female', basic: 48000 },
  { name: 'Mr. Harish Gowda', email: 'harish.gowda', roles: ['teacher'], dept: SC, designation: 'Post Graduate Teacher', gender: 'male', basic: 55000 },
  { name: 'Mrs. Rashmi Desai', email: 'rashmi.desai', roles: ['teacher'], dept: SC, designation: 'Post Graduate Teacher', gender: 'female', basic: 54000 },
  { name: 'Ms. Shruthi Menon', email: 'shruthi.menon', roles: ['teacher'], dept: SC, designation: 'Trained Graduate Teacher', gender: 'female', basic: 46000 },
  { name: 'Mr. Naveen Patil', email: 'naveen.patil', roles: ['teacher'], dept: SC, designation: 'Trained Graduate Teacher', gender: 'male', basic: 46000 },
  { name: 'Mrs. Deepika Nair', email: 'deepika.nair', roles: ['teacher'], dept: SC, designation: 'Primary Teacher', gender: 'female', basic: 38000 },
  // Mathematics
  { name: 'Mr. Kiran Acharya', email: 'kiran.acharya', roles: ['teacher'], dept: MA, designation: 'Post Graduate Teacher', gender: 'male', basic: 54000 },
  { name: 'Mrs. Vidya Hegde', email: 'vidya.hegde', roles: ['teacher'], dept: MA, designation: 'Trained Graduate Teacher', gender: 'female', basic: 47000 },
  { name: 'Ms. Pooja Kamath', email: 'pooja.kamath', roles: ['teacher'], dept: MA, designation: 'Trained Graduate Teacher', gender: 'female', basic: 45000 },
  { name: 'Mrs. Sunanda Pai', email: 'sunanda.pai', roles: ['teacher'], dept: MA, designation: 'Primary Teacher', gender: 'female', basic: 38000 },
  { name: 'Mr. Manoj Swamy', email: 'manoj.swamy', roles: ['teacher'], dept: MA, designation: 'Primary Teacher', gender: 'male', basic: 37000 },
  // Languages
  { name: 'Mrs. Esther Mathew', email: 'esther.mathew', roles: ['teacher'], dept: LA, designation: 'Post Graduate Teacher (English)', gender: 'female', basic: 52000 },
  { name: 'Ms. Ananya Fernandes', email: 'ananya.fernandes', roles: ['teacher'], dept: LA, designation: 'Trained Graduate Teacher (English)', gender: 'female', basic: 45000 },
  { name: 'Mrs. Latha Gowda', email: 'latha.gowda', roles: ['teacher'], dept: LA, designation: 'Primary Teacher (English)', gender: 'female', basic: 38000 },
  { name: 'Mrs. Vasudha Murthy', email: 'vasudha.murthy', roles: ['teacher'], dept: LA, designation: 'Trained Graduate Teacher (Kannada)', gender: 'female', basic: 44000, lang: 'kn' },
  { name: 'Mr. Shivakumar Hiremath', email: 'shivakumar.hiremath', roles: ['teacher'], dept: LA, designation: 'Primary Teacher (Kannada)', gender: 'male', basic: 37000, lang: 'kn' },
  { name: 'Mr. Rajiv Sharma', email: 'rajiv.sharma', roles: ['teacher'], dept: LA, designation: 'Trained Graduate Teacher (Hindi)', gender: 'male', basic: 44000, lang: 'hi' },
  { name: 'Mrs. Nisha Gupta', email: 'nisha.gupta', roles: ['teacher'], dept: LA, designation: 'Primary Teacher (Hindi)', gender: 'female', basic: 37000, lang: 'hi' },
  // Social Science
  { name: 'Mrs. Deepa Nair', email: 'deepa.nair', roles: ['teacher'], dept: SS, designation: 'Trained Graduate Teacher', gender: 'female', basic: 47000 },
  { name: 'Mr. Girish Patil', email: 'girish.patil', roles: ['teacher'], dept: SS, designation: 'Post Graduate Teacher (Economics)', gender: 'male', basic: 52000 },
  { name: 'Mrs. Nalini Bhat', email: 'nalini.bhat', roles: ['teacher'], dept: SS, designation: 'Trained Graduate Teacher', gender: 'female', basic: 45000 },
  // Computer Science
  { name: 'Mrs. Sowmya Reddy', email: 'sowmya.reddy', roles: ['teacher'], dept: CS, designation: 'Post Graduate Teacher', gender: 'female', basic: 52000 },
  { name: 'Mr. Faisal Ahmed', email: 'faisal.ahmed', roles: ['teacher'], dept: CS, designation: 'Computer Teacher', gender: 'male', basic: 42000 },
  // Commerce
  { name: 'Mr. Sudhir Kamath', email: 'sudhir.kamath', roles: ['teacher'], dept: 'Commerce', designation: 'Post Graduate Teacher (Accountancy)', gender: 'male', basic: 54000 },
  { name: 'Mrs. Harini Acharya', email: 'harini.acharya', roles: ['teacher'], dept: 'Commerce', designation: 'Post Graduate Teacher (Business Studies)', gender: 'female', basic: 52000 },
];
/** College login prefixes used by the shared seed stages, pointed at a school colleague. */
export const ALIASES: Record<string, string> = PROFILE === 'school'
  ? { iqac: 'coordinator', research: 'coordinator', placements: 'counsellor', 'hod.management': 'hod.social', 'hod.aviation': 'hod.science' }
  : {};

export interface SpecialStudent { name: string; female: boolean; prog: string; term: number }
export interface Institution {
  slug: string; domain: string; name: string; kind: 'school' | 'college'; shortName: string; address: string; affiliation: string; scheme: string;
  campus: string; codePrefix: string;
  /** Strong student (father has a login) and weak-attendance student (mother has a login, with a younger sibling). */
  strong: SpecialStudent & { login: string; parentLogin: string; parentName: string; teacher: string };
  weak: SpecialStudent & { login: string; parentLogin: string; parentName: string; teacher: string };
  sibling: SpecialStudent;
}
const COLLEGE: Institution = {
  slug: 'soundarya', domain: 'soundarya.demo.zynetix.in', name: 'Soundarya Institute of Management and Science', kind: 'college', shortName: 'SIMS',
  address: 'Soundarya Nagar, Sidedahalli, Nagasandra Post, Bengaluru 560073', affiliation: 'Bengaluru City University', scheme: 'NEP semester scheme',
  campus: 'Soundarya Nagar Campus', codePrefix: 'SIMS',
  strong: { name: 'Sahana Gowda', female: true, prog: 'BCM', term: 3, login: 'student.bcom', parentLogin: 'parent.bcom', parentName: 'Basavaraj Gowda', teacher: 'sudhir.kamath' },
  weak: { name: 'Vignesh Naik', female: false, prog: 'BCA', term: 3, login: 'student.bca', parentLogin: 'parent.bca', parentName: 'Revathi Naik', teacher: 'sowmya.reddy' },
  sibling: { name: 'Chaitra Naik', female: true, prog: 'BBA', term: 1 },
};
const SCHOOL: Institution = {
  slug: 'vidyaniketan', domain: 'vidyaniketan.demo.zynetix.in', name: 'Sri Vidya Niketan Public School', kind: 'school', shortName: 'SVNPS',
  address: '14th Cross, 2nd Stage, Basaveshwaranagar, Bengaluru 560079', affiliation: 'CBSE (Affiliation No. 830999)', scheme: 'CBSE, classes 1 to 12',
  campus: 'Basaveshwaranagar Campus', codePrefix: 'SVN',
  strong: { name: 'Ananya Rao', female: true, prog: 'SEC', term: 10, login: 'student.class10', parentLogin: 'parent.class10', parentName: 'Suresh Rao', teacher: 'sudhir.kamath' },
  weak: { name: 'Rohan Shetty', female: false, prog: 'MID', term: 7, login: 'student.class7', parentLogin: 'parent.class7', parentName: 'Lakshmi Shetty', teacher: 'sowmya.reddy' },
  sibling: { name: 'Diya Shetty', female: true, prog: 'PRI', term: 3 },
};
export const INST: Institution = PROFILE === 'school' ? SCHOOL : COLLEGE;
export const DOMAIN = INST.domain;
export const SLUG = INST.slug;
export const PROGRAMS: ProgramDef[] = PROFILE === 'school' ? S_PROGRAMS : C_PROGRAMS;
export const STAFF: StaffDef[] = PROFILE === 'school' ? S_STAFF : C_STAFF;
export const LOGIN_STAFF = PROFILE === 'school'
  ? ['principal', 'admin', 'accounts', 'library', 'hr', 'counsellor', 'controller', 'coordinator', 'hod.science', 'hod.maths', 'kavya.shetty', 'sudhir.kamath', 'sowmya.reddy']
  : C_LOGIN_STAFF;
