/**
 * Ready-made programme outcome sets a programme can start from and then edit: NBA graduate attributes for engineering
 * (the twelve POs used until 2024 and the eleven of the 2025 revision), NBA management and pharmacy POs, and UGC LOCF
 * graduate attributes for undergraduate arts, science and commerce programmes reporting to NAAC, with PSO examples for
 * BCom, BBA and BCA. Applying a preset adds the outcomes whose codes the programme does not have yet.
 */
import type { ObeFramework } from '../db/schema-obe-flagship.js';

export interface OutcomePreset {
  key: string;
  label: string;
  /** The framework the preset is meant for. */
  framework: ObeFramework;
  outcomes: { kind: 'po' | 'pso'; code: string; statement: string }[];
}

const po = (n: number, title: string, text: string) => ({ kind: 'po' as const, code: `PO${n}`, statement: `${title}: ${text}` });
const pso = (n: number, text: string) => ({ kind: 'pso' as const, code: `PSO${n}`, statement: text });

export const OUTCOME_PRESETS: OutcomePreset[] = [
  {
    key: 'nba_engineering',
    label: 'NBA engineering graduate attributes (PO1 to PO12)',
    framework: 'nba_tier2',
    outcomes: [
      po(1, 'Engineering knowledge', 'Apply the knowledge of mathematics, science, engineering fundamentals and an engineering specialisation to the solution of complex engineering problems.'),
      po(2, 'Problem analysis', 'Identify, formulate, review research literature and analyse complex engineering problems reaching substantiated conclusions using first principles of mathematics, natural sciences and engineering sciences.'),
      po(3, 'Design and development of solutions', 'Design solutions for complex engineering problems and design system components or processes that meet the specified needs with appropriate consideration for public health and safety, and cultural, societal and environmental considerations.'),
      po(4, 'Conduct investigations of complex problems', 'Use research-based knowledge and research methods including design of experiments, analysis and interpretation of data, and synthesis of the information to provide valid conclusions.'),
      po(5, 'Modern tool usage', 'Create, select and apply appropriate techniques, resources and modern engineering and IT tools, including prediction and modelling, to complex engineering activities with an understanding of the limitations.'),
      po(6, 'The engineer and society', 'Apply reasoning informed by contextual knowledge to assess societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to professional engineering practice.'),
      po(7, 'Environment and sustainability', 'Understand the impact of professional engineering solutions in societal and environmental contexts, and demonstrate the knowledge of, and need for, sustainable development.'),
      po(8, 'Ethics', 'Apply ethical principles and commit to professional ethics and responsibilities and norms of engineering practice.'),
      po(9, 'Individual and team work', 'Function effectively as an individual, and as a member or leader in diverse teams and in multidisciplinary settings.'),
      po(10, 'Communication', 'Communicate effectively on complex engineering activities with the engineering community and with society at large, such as being able to comprehend and write effective reports and design documentation, make effective presentations, and give and receive clear instructions.'),
      po(11, 'Project management and finance', 'Demonstrate knowledge and understanding of engineering and management principles and apply these to one’s own work, as a member and leader in a team, to manage projects in multidisciplinary environments.'),
      po(12, 'Life-long learning', 'Recognise the need for, and have the preparation and ability to engage in, independent and life-long learning in the broadest context of technological change.'),
    ],
  },
  {
    key: 'nba_engineering_2025',
    label: 'NBA engineering graduate attributes, 2025 revision (PO1 to PO11)',
    framework: 'nba_tier2',
    outcomes: [
      po(1, 'Engineering knowledge', 'Apply knowledge of mathematics, natural science, computing, engineering fundamentals and an engineering specialisation to develop solutions to complex engineering problems.'),
      po(2, 'Problem analysis', 'Identify, formulate, review research literature and analyse complex engineering problems reaching substantiated conclusions with consideration for sustainable development.'),
      po(3, 'Design and development of solutions', 'Design creative solutions for complex engineering problems and design systems, components or processes to meet identified needs with consideration for public health, safety, culture, society and the environment.'),
      po(4, 'Conduct investigations of complex problems', 'Conduct investigations of complex engineering problems using research-based knowledge, including design of experiments, modelling, analysis and interpretation of data, to provide valid conclusions.'),
      po(5, 'Engineering tool usage', 'Create, select and apply appropriate techniques, resources and modern engineering and IT tools, including prediction and modelling, recognising their limitations, to solve complex engineering problems.'),
      po(6, 'The engineer and the world', 'Analyse and evaluate societal and environmental aspects while solving complex engineering problems for their impact on sustainability with reference to economy, health, safety, legal framework, culture and environment.'),
      po(7, 'Ethics', 'Apply ethical principles and commit to professional ethics, human values, diversity and inclusion, and adhere to national and international laws.'),
      po(8, 'Individual and collaborative team work', 'Function effectively as an individual, and as a member or leader in diverse and multidisciplinary teams.'),
      po(9, 'Communication', 'Communicate effectively and inclusively within the engineering community and society at large, taking into account cultural, language and learning differences.'),
      po(10, 'Project management and finance', 'Apply knowledge and understanding of engineering management principles and economic decision-making to one’s own work, as a member and leader in a team, and to manage projects in multidisciplinary environments.'),
      po(11, 'Life-long learning', 'Recognise the need for, and have the preparation and ability for, independent and life-long learning, adaptability to new and emerging technologies, and critical thinking in the broadest context of technological change.'),
    ],
  },
  {
    key: 'nba_management',
    label: 'NBA management (MBA and PGDM) programme outcomes',
    framework: 'nba_management',
    outcomes: [
      po(1, 'Management knowledge', 'Apply knowledge of management theories and practices to solve business problems.'),
      po(2, 'Analytical decision making', 'Foster analytical and critical thinking abilities for data-based decision making.'),
      po(3, 'Value-based leadership', 'Develop value-based leadership ability.'),
      po(4, 'Business environment', 'Understand, analyse and communicate global, economic, legal and ethical aspects of business.'),
      po(5, 'Teamwork', 'Lead themselves and others in the achievement of organisational goals, contributing effectively to a team environment.'),
    ],
  },
  {
    key: 'nba_pharmacy',
    label: 'NBA pharmacy (B.Pharm) programme outcomes',
    framework: 'nba_pharmacy',
    outcomes: [
      po(1, 'Pharmacy knowledge', 'Possess knowledge and comprehension of the core and basic knowledge associated with the profession of pharmacy, including biomedical sciences, pharmaceutical sciences, behavioural and social sciences, and administrative and clinical sciences.'),
      po(2, 'Planning abilities', 'Demonstrate effective planning abilities including time management, resource management, delegation skills and organisational skills.'),
      po(3, 'Problem analysis', 'Utilise the principles of scientific enquiry, thinking analytically, clearly and critically, while solving problems and making decisions during daily practice.'),
      po(4, 'Modern tool usage', 'Learn, select and apply appropriate methods and procedures, resources, and modern pharmacy-related computing tools with an understanding of the limitations.'),
      po(5, 'Leadership skills', 'Understand and consider the human reaction to change, motivation issues, leadership and team-building when planning changes required for the fulfilment of practice, professional and societal responsibilities.'),
      po(6, 'Professional identity', 'Understand, analyse and communicate the value of their professional roles in society as health care professionals, promoters of health, educators, managers, employers and employees.'),
      po(7, 'Pharmaceutical ethics', 'Honour personal values and apply ethical principles in professional and social contexts.'),
      po(8, 'Communication', 'Communicate effectively with the pharmacy community and with society at large, such as being able to comprehend and write effective reports, make effective presentations and documentation, and give and receive clear instructions.'),
      po(9, 'The pharmacist and society', 'Carry out professional practices for the benefit of society, applying reasoning informed by contextual knowledge to assess societal, health, safety and legal issues.'),
      po(10, 'Environment and sustainability', 'Understand the impact of professional pharmacy solutions in societal and environmental contexts, and demonstrate the knowledge of, and need for, sustainable development.'),
      po(11, 'Life-long learning', 'Recognise the need for, and have the preparation and ability to engage in, independent and life-long learning in the broadest context of technological change.'),
    ],
  },
  {
    key: 'ugc_locf',
    label: 'UGC LOCF graduate attributes for undergraduate programmes (NAAC)',
    framework: 'naac',
    outcomes: [
      po(1, 'Disciplinary knowledge', 'Demonstrate comprehensive knowledge and understanding of one or more disciplines that form part of the programme.'),
      po(2, 'Communication skills', 'Express thoughts and ideas effectively in writing and orally, and communicate with others using appropriate media.'),
      po(3, 'Critical thinking', 'Apply analytic thought to a body of knowledge, analyse and evaluate evidence, arguments, claims and beliefs on the basis of empirical evidence.'),
      po(4, 'Problem solving', 'Extrapolate from what one has learned and apply competencies to solve different kinds of non-familiar problems in real-life situations.'),
      po(5, 'Research-related skills', 'Define problems, formulate hypotheses, collect and analyse data, and draw conclusions, showing a sense of inquiry.'),
      po(6, 'Teamwork and leadership', 'Work effectively and respectfully with diverse teams, and lead a team towards a common goal.'),
      po(7, 'Digital literacy', 'Use ICT in a variety of learning situations, and access, evaluate and use a variety of relevant information sources.'),
      po(8, 'Moral and ethical awareness', 'Embrace moral and ethical values in conducting one’s life and avoid unethical behaviour such as plagiarism and misrepresentation of data.'),
      po(9, 'Multicultural competence and citizenship', 'Possess knowledge of the values and beliefs of multiple cultures, and act with a global perspective and civic responsibility.'),
      po(10, 'Life-long learning', 'Acquire knowledge and skills through self-paced and self-directed learning aimed at personal development and changing workplace demands.'),
    ],
  },
  {
    key: 'pso_bcom',
    label: 'Programme specific outcomes: BCom',
    framework: 'naac',
    outcomes: [
      pso(1, 'Prepare and analyse financial statements, cost and management accounts of business organisations in line with Indian accounting standards.'),
      pso(2, 'Apply the provisions of taxation, company and business laws to compute liabilities and advise on compliance.'),
      pso(3, 'Use accounting software and financial data to support business decisions in banking, insurance and finance roles.'),
    ],
  },
  {
    key: 'pso_bba',
    label: 'Programme specific outcomes: BBA',
    framework: 'naac',
    outcomes: [
      pso(1, 'Apply the functional areas of management (marketing, finance, human resources and operations) to analyse and solve business problems.'),
      pso(2, 'Develop entrepreneurial and managerial skills to plan, organise and lead ventures and teams.'),
    ],
  },
  {
    key: 'pso_bca',
    label: 'Programme specific outcomes: BCA',
    framework: 'naac',
    outcomes: [
      pso(1, 'Design, develop and test software applications using programming languages, data structures and databases.'),
      pso(2, 'Apply networking, web and cloud technologies to build and deploy secure computing solutions for organisations.'),
    ],
  },
];

export const presetByKey = (key: string) => OUTCOME_PRESETS.find((p) => p.key === key);
