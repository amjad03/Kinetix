/** Static content of the Soundarya demo: programmes, NEP papers, people's names. All people are fictional. */

export const DOMAIN = 'soundarya.demo.kinetix.in';
export const PASSWORD = 'kinetix123';
export const SLUG = 'soundarya';

export type Dept = 'Management Studies' | 'Commerce' | 'Computer Applications' | 'Aviation Studies' | 'Languages' | 'Mathematics and Statistics';
export const DEPARTMENTS: Dept[] = ['Management Studies', 'Commerce', 'Computer Applications', 'Aviation Studies', 'Languages', 'Mathematics and Statistics'];

export interface ProgramDef {
  code: string;
  name: string;
  level: 'ug' | 'pg';
  terms: number;
  /** Semester fee in rupees. */
  feeInr: number;
  dept: Dept;
  /** Sections for odd semesters: [term, size]. */
  classes: [number, number][];
  /** Students of this programme who live in the hostel (percent). */
  papers: Record<number, [string, number, Dept?][]>;
}

const L1: [string, number, Dept] = ['Kannada / Hindi (Language I)', 3, 'Languages'];
const L2: [string, number, Dept] = ['English (Language II)', 3, 'Languages'];
const DF: [string, number, Dept] = ['Digital Fluency', 2, 'Computer Applications'];
const CI: [string, number, Dept] = ['Constitution of India', 2, 'Languages'];
const L3: [string, number, Dept] = ['English III: Professional Communication', 3, 'Languages'];

export const PROGRAMS: ProgramDef[] = [
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
export const STAFF: StaffDef[] = [
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
export const LOGIN_STAFF = ['principal', 'admin', 'accounts', 'library', 'hr', 'counsellor', 'controller', 'iqac', 'hod.commerce', 'hod.computers', 'deepa.nair', 'sudhir.kamath', 'sowmya.reddy'];
