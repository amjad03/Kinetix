# Teachmint X: Competitive Analysis for KINETIX Board

- **Prepared:** 2026-10-04
- **Scope:** Teachmint X / X2 AI interactive flat panels (IFPs), EduAI, VisionX, Click X, Share X, the Teachmint platform and ERP, plus five other smart-board competitors in India.
- **Purpose:** List every Teachmint feature KINETIX Board must match, and find where a software-only board (Android tablet or IFP plus projector/TV, on our own ERP) can do better.

> **How this was researched.** The research environment's egress proxy blocked direct page fetches from teachmint.com, blog/cart/community.teachmint.com, Amazon, Flipkart, Entrackr, Forbes India and afaqs. Every claim below therefore comes from **search-engine snippets of those pages**. Snippets can be stale or paraphrased. A claim with no named source, or with conflicting sources, is marked **(unverified)**. Before any claim goes into sales material, check it against the live page or a demo unit.

---

## 1. Teachmint X overview

### 1.1 Company and positioning
| Item | Detail | Source |
|---|---|---|
| Company | Teachmint Technologies Pvt Ltd, Bengaluru. Founded 2020 by Mihir Gupta (CEO), Payoj Jain, Divyansh Bordia and Anshuman Kumar. | startuppedia.in, Tracxn |
| Funding | About US$118M raised. Investors include Learn Capital, Lightspeed India, Rocketship VC and Better Capital. | startuppedia.in / Inc42 |
| Pivot | Started as a mobile-first live-class app for tutors and coaching. In 2023 it pivoted to "digitising schools" (K-12 ERP plus LMS). It now positions itself as an **"AI-powered connected classroom" hardware company**. | entrackr.com/2023/04/teachmint-pivots-to-focus-solely-on-digitizing-schools |
| Tagline | "World's first AI-powered connected classroom technology" and "AI-powered digital board for teaching". | teachmint.com/en-us; channeldrive.in |
| Financials | FY24 loss ₹110 Cr. FY25 revenue ₹74 Cr (4.3x), loss ₹46.6 Cr (down 57%). FY26 operating revenue **₹205.3 Cr (2.8x)**, growth "largely led by Teachmint X". | Inc42; entrackr.com (FY25, FY26) |
| Revenue mix | Entrackr reports that in FY25 "sales of X and X2 and related services" were the **sole revenue source**. The ERP and LMS are effectively bundled or free and are not monetised separately. | entrackr.com/fintrackr/teachmints-revenue-jumps-43x-in-fy25 |
| Scale claims | "10,000+ schools and institutes across 50+ countries" (older platform-wide claim). Teachmint blog: "adopted across 50+ countries". A Teachmint page: "AI classrooms across 10+ countries". Figures conflict, so treat the counts as **unverified marketing**. | getapp / softwarefinder; blog.teachmint.com; newsx.com |
| Named customers | Auxilium Convent (Siliguri), Shivaji English Medium School, Janani Vidya Mandira (Bengaluru), Navodaya institutions (incl. dental college), Ateneo de Naga Univ. JHS (Philippines). | dailypioneer.com; newsx.com |
| GTM | Teachmint authorised partners and distributors (IndiaMART, TradeIndia and regional AV resellers), its own store (cart.teachmint.com), Amazon.in, Flipkart. "One-Day AI Transformation" offer: same-day delivery, installation and onboarding. | cxotoday "One-Day AI Transformation"; IndiaMART listings |
| Geographies | India, US, MEA and Philippines sites (/en-us, /en-mea, /en-ph). | teachmint.com locale pages |

### 1.2 Hardware lineup
| Generation / SKU | Sizes | OS | SoC / RAM / ROM | Notable hardware | Price signals (INR) |
|---|---|---|---|---|---|
| **X1 Plus** (2023–24) | 65/75/86" | Android (version unverified) | 8 GB / 128 GB | 4K, IR touch | 65" ₹1,09,999 (smartprix, Mar 2025) |
| **X1 Pro** | 65/75/86" | Android | 8 GB / 128 GB | Adds USB-C and DisplayPort; camera on "with camera" SKUs | 65" ₹1,29,999 (smartprix, Feb 2025) |
| **X2 Plus** (launched 28 Feb 2025) | 65/75/86" | **Android 14, Google EDLA** | Octa-core, 8 GB / 128 GB, NPU | 4K UHD, 20-pt touch, zero bonding, 9H glass, blue-light filter, 40 W speakers, NFC reader, HDMI/USB-C/USB 3.0/LAN/Wi-Fi/BT | 75" ₹1,25,000 (IndiaMART) |
| **X2 Pro** | 65/75/86" | Android 14 EDLA | **Rockchip RK3576** (4x A72 @2.2 GHz + 4x A53 @2.0 GHz), Mali-G52, **6 TOPS NPU**, 8 GB / 128 GB | 48 MP 4K AI camera, mic array, 40 W speakers, NFC, 400–450 nits, 10-bit colour, 3.2 mm toughened glass (Mohs 9) | 75" ₹1,20,000 to ₹1,74,999; 86" ₹1,40,000 to ₹2,49,999; Flipkart/Amazon list up to about ₹3,00,000 MRP; tradeindia from ₹99,000 |
| **X2 Neo** (latest, 2026) | 65/75/86" | **Android 16 EDLA** (one Teachmint page still says Android 14, unverified) | "2x faster" octa-core, "most powerful NPU", **8 GB / 256 GB** | **48 MP 4K AI camera with motion tracking, 8-array omni mic**, 40 W speakers, dual-band Wi-Fi, NFC | Amazon listing (price not captured) |
| Other reseller SKUs | "X2 Star" and "X2 Ultra" appear on reseller sites | (unverified) | | | |

Common to all: 4K 3840x2160 panel. 20-point touch on Android, **40-point on Windows / OPS or an external PC**. OPS slot for a Windows PC. **3-year on-site warranty, extendable to 5**. Installation "within 3 working days across 19,000+ locations". (Sources: Flipkart/IndiaMART/cart.teachmint.com spec pages via snippets; teachmint.com/teachmintx-installation-training-support.)

### 1.3 Software stack (names as Teachmint uses them)
| Component | What it is |
|---|---|
| **Teachmint X Whiteboard** | Proprietary whiteboard and annotation app on the panel. |
| **EduAI** | AI teaching assistant on the board, in the teacher app and on the web. Runs partly on the device NPU (X2), the rest in the cloud. |
| **Connected Classroom platform / Teachmint app** ("Teachmint AI Connected Classes", Play Store `com.teachmint.teachmint`; iOS "Teachmint Connected Classroom") | Teacher, student and parent apps plus admin web: attendance, notes, homework, tests, recordings, live classes. |
| **VisionX** (+ VisionX Console for Android, Windows and Mac) | Principal and admin live monitoring and broadcast system. **Exclusive to Teachmint X.** |
| **Click X** | Hardware student-response clickers with a base station built into the panel. Exclusive to Teachmint X. |
| **Share X** | Wireless casting app (iPad/iOS, plus Android and Windows per marketing). Multi-device simultaneous sharing. |
| **Google EDLA / GMS** | Play Store, Drive, Docs, Meet, Classroom and Play Protect on the panel. |
| **Teachmint ERP / LMS** | Admissions, fees, attendance, timetable, report cards and communication. The status of the standalone ERP in 2026 is unclear (see section 3). |

### 1.4 Pricing and business model
- **Model:** a one-time hardware sale (₹1.0–3.0 lakh per panel, depending on size and SKU), with software, EduAI and the platform **bundled**. Hardware is effectively the only revenue line (Entrackr FY25).
- **Software list price:** directories show "from US$5 per user per year" for the platform (softwarefinder / softwaresuggest; **unverified**, likely a legacy LMS price).
- **Recurring fees for EduAI after year 1:** not found publicly (**unverified**). Ask a reseller.
- **Services bundled:** installation, offline teacher training, unlimited online refresher training, 365-day support ("email in 30 min, calls answered in 30 s").

---

## 2. Exhaustive Teachmint X feature list

Legend: Source codes are listed at the end of this section. **(U)** = unverified or only in secondary sources.

### 2.1 Whiteboard and annotation
| # | Feature | Description | Src |
|---|---|---|---|
| W1 | Infinite canvas | Unlimited scrolling board area per lesson. | S3, S8 |
| W2 | Smooth handwriting, "zero-lag" | Low-latency inking via zero-bonding glass; "natural writing". | S4, S11 |
| W3 | Adjustable pens | Pen, highlighter and colours; adjustable thickness. | S8 |
| W4 | Palm eraser | Erase with palm or back of hand (gesture). | S3 |
| W5 | Shape detection | Hand-drawn shapes snap to clean geometry. | S3 |
| W6 | 2D shape library | Line, circle, ellipse, triangle, right triangle, square, rectangle and more. | S3 (community) |
| W7 | 3D shape library | Sphere, cube, cuboid, pyramid, cylinder, hemisphere, cone and more. | S3 (community) |
| W8 | Geometry instruments | Ruler and protractor on the whiteboard (community FAQ). Compass and set-square not confirmed. | S3 **(U)** |
| W9 | Smart math solver | Write an equation and EduAI solves it on the board. | S3, S8 |
| W10 | Annotate over anything | Draw and highlight over websites, videos, PDFs and apps without switching screens (overlay annotation). | S2 |
| W11 | Multi-touch collaboration | 20 points (Android) or 40 points (Windows/OPS), so several students can write at once. | S2, S6 |
| W12 | Import PDFs/files | Teach from PDFs and documents (Drive/Docs via EDLA). | S2, S11 |
| W13 | Split screen | Several apps side by side. | S8 |
| W14 | Auto cloud save | Board notes and lesson progress save continuously to the cloud. | S1, S9 |
| W15 | Save and share board | Export whiteboard sessions and share them with students in the app. | S9 |
| W16 | Generate and edit 2D/3D images | Generate images with AI and place them on the board. | S10 **(U)** |
| W17 | Templates | "Templates" listed among EduAI outputs. | S12 **(U)** |
| W18 | Speech-to-text | Dictate text onto the board. | S12 **(U)** |

### 2.2 AI features (EduAI, plus camera AI)
| # | Feature | Description | Src |
|---|---|---|---|
| A1 | AI lesson plans | Generate lesson plans for any grade or curriculum. | S1, S8 |
| A2 | One-click lecture / presentation | Generates "interactive presentations" or a lecture from a topic. | S2, S8 |
| A3 | AI quiz generator ("adaptive") | Instant quizzes for a topic or for what was taught in class. | S1, S8 |
| A4 | AI homework generator | Homework sets that can be pushed to the student app. | S2, S8 |
| A5 | Lecture summaries / class recaps | Summarises the lesson for students afterwards. | S1, S12 |
| A6 | Topic explanations | On-demand concept explanations on the board. | S1, S10 |
| A7 | Math solver | Solves handwritten equations step by step. | S3, S8 |
| A8 | Image generation | Generates 2D/3D images and diagrams. | S10 **(U)** |
| A9 | Multilingual generation | "Multiple languages"; one page says "90+ global languages" (**U**; Indian-language quality unknown). | S9, S13 |
| A10 | Voice and text prompts | Create resources by voice ("voice-activated explanations"). | S12, S13 |
| A11 | Curriculum-aligned output | Aligned "to the curriculum and what has been taught in that classroom". | S5 (Inc42) |
| A12 | AI grading of submissions | "Grade student submissions" (homework/tests) with AI. | S5 (Inc42) **(U on depth)** |
| A13 | On-device AI (NPU) | X2: 6 TOPS NPU for local AI (personalisation and feedback claims are vague). | S4, S6 |
| A14 | Smart Attendance (face recognition) | The panel camera marks attendance in seconds and the teacher reviews or edits. | S9 (community) |
| A15 | AI camera motion tracking / auto-framing | 48 MP camera follows the teacher for hybrid classes and recordings. | S6 |

### 2.3 Content library and curriculum
| # | Feature | Description | Src |
|---|---|---|---|
| C1 | "Curriculum-ready" content | Claims suitability for CBSE schools; content is mostly AI-generated rather than a large pre-built animated K-12 library. | S10 **(U)** |
| C2 | Google Play apps | Any Play Store educational app (e.g., YouTube, GeoGebra, PhET). | S4, S11 |
| C3 | Recorded lecture library | Recorded classes stored and accessible "anytime" by students. | S9, S10 |
| C4 | No proprietary 3D/animation K-12 library found | Unlike Extramarks or Tata ClassEdge, no evidence of a large owned video/animation library. | Gap (research) **(U)** |

### 2.4 Teaching tools and widgets
| # | Feature | Description | Src |
|---|---|---|---|
| T1 | Click X clickers | Hardware response pads per desk; MCQ polls and quizzes; real-time results and "100% participation". | S7 |
| T2 | Live polls / quizzes on board | Run AI-generated quizzes in class, with Click X or student devices. | S7, S8 |
| T3 | Wireless casting (Share X) | Teacher or student phones/tablets cast to the panel; multiple sharers at once; stream not stored. | S14 |
| T4 | Split screen and multitasking | Already covered under W13. | S8 |
| T5 | Classroom widgets (timer, stopwatch, random picker, spotlight, screen shade) | Standard on EDLA IFPs, but **not confirmed** for the Teachmint launcher. | **(U)** |

### 2.5 Recording and lecture capture
| # | Feature | Description | Src |
|---|---|---|---|
| R1 | Record whiteboard sessions | Screen plus audio recording of the board. | S9 |
| R2 | Record with camera | 4K AI camera plus 8-array mic for full-lecture capture. | S6 |
| R3 | Live / hybrid classes | Conduct live online classes from the board (Teachmint live-class heritage, Google Meet via EDLA). | S9, S15 |
| R4 | Auto-share recordings to student app | Recordings published for students to rewatch. | S9, S10 |

### 2.6 Attendance
| # | Feature | Description | Src |
|---|---|---|---|
| AT1 | Face-recognition attendance | See A14. | S9 |
| AT2 | Manual digital attendance | On board or app; syncs to the platform and parents. | S9, S16 |
| AT3 | Parent notification | Parents see attendance records in the app. | S16 |

### 2.7 ERP / LMS integration
| # | Feature | Description | Src |
|---|---|---|---|
| E1 | Push from board to student app | Homework, tests, notes and reading material sent from the IFP to students in the Teachmint app. | S16 |
| E2 | Timetable / class context | Timetables visible to students and parents; class context for EduAI. | S16 **(U on board-side timetable)** |
| E3 | ERP modules | Admissions, fee invoicing, staff schedules, attendance, report cards, communication. | S16, S17 |
| E4 | Student performance tracking | Homework, attendance and test performance; "learning gap" insights. | S12 |
| E5 | Third-party ERP integration | None documented. The board is tied to the Teachmint platform. | Gap **(U)** |

### 2.8 Assessments and quizzes
| # | Feature | Description | Src |
|---|---|---|---|
| Q1 | AI quiz creation | See A3. | S1 |
| Q2 | In-class response via Click X | See T1. | S7 |
| Q3 | Online tests in student app | Tests via the app; reviewers report app crashes during tests. | S17 (reviews) |
| Q4 | AI grading | See A12. | S5 |
| Q5 | Reports and analytics | Per-student performance insights. | S12 |

### 2.9 Multi-language
| # | Feature | Description | Src |
|---|---|---|---|
| L1 | Multilingual AI generation | "Multiple languages" / "90+ languages". | S9, S13 |
| L2 | Indian regional-language UI | The legacy app supported "multiple regional languages". Panel UI languages are **unverified**. Kannada support specifically is **unverified**. | S13 |

### 2.10 Teacher onboarding and training
| # | Feature | Description | Src |
|---|---|---|---|
| O1 | Offline in-school training | Included for all schools and colleges. | S18 |
| O2 | Unlimited online refresher sessions | Included. | S18 |
| O3 | "One-Day AI Transformation" | Delivery, installation and onboarding in one day. | S19 |
| O4 | Community forum | community.teachmint.com Q&A. | S3 |

### 2.11 Admin and principal features
| # | Feature | Description | Src |
|---|---|---|---|
| P1 | VisionX live classroom feeds | Admins see the live camera feed of any classroom. | S7, S20 |
| P2 | VisionX board mirror | See what is on the digital board in real time. | S7, S20 |
| P3 | VisionX live audio | Listen to classroom audio. | S7, S20 |
| P4 | Broadcast messaging, alerts and logs | Send announcements to one or all classrooms; logs kept. | S7 |
| P5 | Multi-classroom search and switching | Grid of classrooms, quick switching. | S20 |
| P6 | Console apps | VisionX Console on Android, Windows and Mac. | S20 |
| P7 | Teacher activity and device-usage monitoring | Lesson delivery, engagement and device usage per teacher. | S12 |
| P8 | VisionX exclusivity | Works only on Teachmint X, not other brands. | S7, community FAQ |

### 2.12 Connectivity and screen-casting
| # | Feature | Description | Src |
|---|---|---|---|
| K1 | Share X wireless casting | Windows, Android and iOS. | S8, S14 |
| K2 | Ports | HDMI in, USB-C (video, touch and charge on Pro), USB 3.0, LAN, DisplayPort (X1 Pro). | S6, S8 |
| K3 | Wi-Fi (dual-band) and Bluetooth | | S6 |
| K4 | NFC card login | Tap a teacher's ID card to log in; also app shortcuts and role management. | S6, S7 |
| K5 | OPS slot | Optional Windows PC module. | S6 |

### 2.13 Device management
| # | Feature | Description | Src |
|---|---|---|---|
| D1 | Google EDLA management | Play Protect, Google account controls, OTA updates. | S4 |
| D2 | Usage monitoring | See P7. | S12 |
| D3 | Remote MDM (lock, app push, scheduling, power) | **Not documented publicly.** Assume partial. | **(U)** |

### 2.14 Offline capability
| # | Feature | Description | Src |
|---|---|---|---|
| F1 | Local whiteboard | Works without internet (standard Android app). | inferred **(U)** |
| F2 | On-device NPU AI | X2 claims local AI processing. The list of offline EduAI functions is **not documented**. | S4 **(U)** |
| F3 | Cloud-dependent features | Cloud sync, VisionX, recordings upload and most EduAI generation need connectivity. | inferred |

### 2.15 Security and privacy
| # | Feature | Description | Src |
|---|---|---|---|
| S1x | Google EDLA plus Play Protect | Continuous malware scanning; positioned as a "classroom security" differentiator. | S4, Business Standard |
| S2x | NFC secure login and role management | | S6 |
| S3x | Share X streams not stored | | S14 |
| S4x | VisionX "complete privacy" claim | Teachmint does not detail it; continuous camera and audio monitoring raises DPDP Act 2023 and child-privacy questions. | S7 |

**Source key**
- S1 blog.teachmint.com/best-interactive-flat-panels-with-ai-features
- S2 teachmint.com/en-us/products/digital-board-for-teaching
- S3 community.teachmint.com (ruler/protractor and whiteboard threads); softwarefinder.com/lms/teachmint
- S4 tribuneindia / cxotoday / itvoice "Teachmint launches Teachmint X2" (28 Feb 2025)
- S5 inc42.com/company/teachmint
- S6 cart.teachmint.com detailed spec pages (X2 Neo, X2 Pro); Flipkart and IndiaMART listings
- S7 teachmint.com/visionx-classroom-management-system; teachmint.com/clickx-student-clickers-for-classroom
- S8 softwaresuggest.com/teachmint; teachmint.com/en-mea/products/digital-board-for-teaching
- S9 teachmint.com/en-us/products/classroom-platform; community thread "Smart Attendance"
- S10 dailypioneer.com Teachmint articles
- S11 business-standard.com Teachmint EDLA article
- S12 softwarefinder.com / elearningindustry.com Teachmint profiles
- S13 teachmint.com/en-us; Play Store listing
- S14 apps.apple.com/app/id6761761537 (Share X)
- S15 teachmint.com/online-teaching-software
- S16 teachmint.com/en-us/features/school-erp; merithub.com/teachmint
- S17 getapp / softwareadvice / G2 reviews
- S18 teachmint.com/teachmintx-installation-training-support; thenewsminute.com partner article
- S19 cxotoday "One-Day AI Transformation"
- S20 businessworld.in "Teachmint Introduces Vision X"

---

## 3. Known weaknesses, gaps and complaints

| # | Weakness | Evidence / reasoning |
|---|---|---|
| G1 | **Hardware lock-in.** EduAI, VisionX, Click X and Smart Attendance work only on Teachmint panels. Schools that already own BenQ, Senses, ViewSonic or no-brand IFPs, or projectors, cannot use them. | VisionX and Click X marketed as "exclusive to Teachmint X" (S7) |
| G2 | **High per-classroom cost:** ₹1.0–3.0 lakh per room. A 40-classroom school spends ₹40 lakh to ₹1.2 Cr. This is prohibitive for budget private, government-aided and state-board schools, and for colleges with many rooms. | Price table in section 1.2 |
| G3 | **Business depends on hardware.** Revenue is essentially hardware, so the software (ERP and LMS) gets less investment and is pushed as a bundle. Directory reviewers (edunodex, itself a competitor) note no current standalone ERP or fee product in the lineup. | Entrackr FY25; edunodex.in (biased source) **(U)** |
| G4 | **Support quality complaints.** Reviewers report "very poor" support, staff pressing for 5-star ratings, and queries taking "months or years". Others praise doorstep service, so experiences are mixed. | getapp / softwareadvice / G2 reviews (S17) |
| G5 | **App bugs and UX gaps.** Bugs, a missing delete button in some modules, confusing editing of linked student/fee records, and **app crashes during tests losing student progress**. | S17 |
| G6 | **Performance complaints** from some users (unspecified). | S17 |
| G7 | **Thin owned content.** The AI generates content but there is no evidence of a deep, vetted, animated K-12 library mapped chapter-by-chapter to CBSE, ICSE and each State Board (e.g., Karnataka SSLC/PUC). AI output risks hallucination without curated grounding. | Research gap **(U)** |
| G8 | **Regional-language depth unclear.** "90+ languages" is a generic LLM claim. No evidence of Kannada/Hindi UI, handwriting recognition or a Kannada-medium curriculum. | **(U)** |
| G9 | **Higher-ed fit is shallow.** There is a higher-education page, but nothing on university syllabi (e.g., Bangalore University NEP UG/PG), LMS integration (Moodle) or outcome-based-education (OBE) / NAAC reporting. | teachmint.com/en-us/education/higher-education **(U)** |
| G10 | **Privacy risk from VisionX.** Always-on camera and audio streaming to the principal can alarm teachers and parents, and needs DPDP-compliant consent and retention policies. No published policy found. | S7 |
| G11 | **Click X is extra hardware.** Pads, batteries and loss management add cost per student. | S7 |
| G12 | **Opaque post-warranty and AI pricing.** No public price for AMC beyond 3/5 years or for continued EduAI. | **(U)** |
| G13 | **Fragmented, shifting SKUs.** X1 Plus/Pro, X2 Plus/Pro/Neo, "Star" and "Ultra", with conflicting OS versions across pages (Android 14 vs 16). Buyers are confused, and reseller prices vary by more than ₹1 lakh for the same SKU. | IndiaMART / Flipkart / tradeindia |
| G14 | **Offline AI unclear.** Most generation is cloud-based. Tier-2/3 schools with poor bandwidth may lose key features. | **(U)** |

---

## 4. Other competitors in India

| Vendor / product | Type | Key features | Price / model | How it differs from Teachmint |
|---|---|---|---|---|
| **BenQ Board Pro RP05** (+ EZWrite 6.0, InstaShare 2) | Hardware IFP (65/75/86"), Android 15 EDLA, **10 TOPS** on-device AI | AI Lesson, AI Quiz from on-screen content, Ask AI chat, **EZMath** (handwriting to equations), **one-tap translation in 59 languages**, AI text-to-speech, **camera gesture** slide control, **Lasso Search** (circle to search), **AI Guardian** blocks inappropriate cast content, ClassroomCare (Eyesafe 3.0, germ-resistant glass), IT controls for camera, mic and files | From ₹2,00,000 (launched India 25 Jun 2026) | Stronger on-device AI and safety; no ERP, school content or principal monitoring. Premium price. |
| **ViewSonic ViewBoard IN05 / IN04V-N** + **myViewBoard 3.0** + **ViewLessons AI Studio** | Hardware IFP, Android 16 EDLA, 48 MP AI camera (IN04V-N), cross-brand whiteboard software | Ask AI voice assistant, Calculator Pro (handwritten math and geometry), **Live Subtitles** (real-time multilingual), accessibility (immersive reader, TTS, Irlen overlays, ADHD/dyslexia aids), opens .ppt/.pdf/Google Slides/.iwb, **900+ editable NCERT-aligned lessons (CBSE/ICSE)** | Hardware sale; myViewBoard has free and premium tiers | Best accessibility and file-format story; software works across brands. No ERP or attendance. |
| **Extramarks Smart Class Plus** + **Extra Intelligence** | Content and software service, often bundled with panels | Large curriculum-mapped animated content (CBSE/ICSE/State), real-time assessments, AI Teacher Assistant (customise lessons), AI analytics and personalised recommendations; rolled out to partner schools from Jul 2025 | Annual per-classroom or per-school subscription (amount unverified) | Content-first: deep library vs. Teachmint's AI-generated content. Weaker on owned hardware AI and VisionX-style admin. |
| **Senses Electronics SenseEDGE 2.0** | Indian-made IFP (Pune), Android 16 EDLA plus Windows OPS | 40-pt IR touch, built-in 4K camera, SensesAI lesson creation, SenseBoard recording, free teacher training and certification | Mid-range (claims "70% market share", **unverified marketing**) | Nearest price and hardware rival; no ERP, attendance AI or principal monitoring. |
| **Tata ClassEdge** | Content plus pedagogy (activity-based) | Interactive multimedia demos plus classroom activities and lesson plans; teacher championship; about 20,000 classrooms and 3,400 schools | Subscription | Strong pedagogy and Tata brand; little AI or hardware innovation. |
| **LEAD Group** (LEAD School, **TECHBOOK**) | Integrated school system (curriculum + tech + training) | TECHBOOK (2025-26, about 400 invite-only schools): AR Instructor for Science/Maths, **Independent Reading Assistant** (listens to the child reading and gives feedback), NCF-aligned; smart-class panels plus teacher app plus assessments | Per-student annual fee (unverified) | Owns the whole curriculum and pedagogy; AI focused on the student rather than the board. |
| **Samsung Flip Pro** | Tizen-based IFP (55/65/75/85") | 26 ms latency, 20-pt touch, USB-C 3-in-1, MimioConnect blended learning | Premium hardware | Enterprise-grade; no India K-12 content or AI teaching assistant. |
| Others (Maxhub, Huawei IdeaHub, Educomp Smartclass) | Hardware / legacy | Maxhub: global IFP OEM with whiteboard and casting. Huawei IdeaHub: limited in India. Educomp Smartclass: legacy content leader (26k schools historically) whose parent went through insolvency; ownership of Smartclass reportedly changed (**unverified**). | | Mostly commodity hardware or legacy content. |

Sources: fonearena.com, 91mobiles.com, benq.com/en-in (RP05); digitalterminal.in, cxotoday.com, mysmartprice.com (ViewSonic); extramarks.com, theweek.in (Extramarks); senseselec.com, tribuneindia.com (Senses); theweek.in, amarujala.com (Tata ClassEdge); cxotoday.com, bwdisrupt.com (LEAD TECHBOOK); samsung.com, educationreview.com.au (Flip Pro).

**Market takeaway:** Hardware AI features (lesson, quiz, math solver, ask-AI, translation, camera tracking) are becoming **commoditised across every EDLA panel in 2025–26**. What remains defensible: (1) deep curriculum-grounded content, (2) ERP and parent-loop integration, (3) admin visibility, (4) cost per classroom, and (5) regional language. Teachmint covers (2) and (3) but locks them to its own hardware. **KINETIX's opening is to deliver all five on any screen.**

---

## 5. KINETIX Board: must-match checklist and differentiators

### 5.1 Must-match checklist (parity with Teachmint X)

**Whiteboard and annotation**
- [ ] Infinite canvas with pages, zoom and pan; low-latency inking (target 30 ms or less on mid-range tablets, using predicted strokes)
- [ ] Pen, highlighter, colours, thickness; palm/gesture eraser; undo/redo; lasso select, move, resize
- [ ] Shape recognition (2D) and a 2D and 3D shape library (rotatable 3D solids)
- [ ] Geometry instruments: ruler, protractor, compass, set-square
- [ ] Handwritten math recognition with step-by-step solver
- [ ] Overlay annotation over any app, video, PDF or website (Android overlay permission plus MediaProjection; Windows transparent overlay)
- [ ] PDF, PPT and image import; Google Drive/Docs open; export to PDF
- [ ] Split-screen and multi-app teaching
- [ ] Auto cloud save of every board, plus share to students
- [ ] Multi-touch collaborative writing on IFPs (20 points or more where the hardware allows)
- [ ] Templates (lined, graph, music, maps, Venn and so on) and AI image or diagram insert

**AI (EduAI parity)**
- [ ] AI lesson plan, one-click lecture or slide deck, topic explanation
- [ ] AI quiz (adaptive) and homework generation, pushed to the student app
- [ ] Lecture summary or recap generated from the actual board and recording, auto-sent to students and parents
- [ ] Voice and text prompting; speech-to-text on board
- [ ] AI grading of homework and test submissions
- [ ] Multilingual output (at minimum English, Hindi and Kannada, then all Eighth Schedule languages)
- [ ] Face-recognition attendance with teacher review and edit (tablet or webcam camera)
- [ ] Some on-device AI (math OCR, handwriting, basic summarisation) for offline or low-bandwidth use

**Teaching tools**
- [ ] Live polls and quizzes with student response through **phones, tablets or ₹0 paper-card scanning (Plickers-style) instead of paid clickers**
- [ ] Wireless casting from teacher and student phones (multi-sharer, teacher approval)
- [ ] Classroom widgets: timer, stopwatch, random name picker (from ERP roster), spotlight, screen shade, noise meter, dice

**Recording and hybrid**
- [ ] Board plus audio recording; optional camera recording
- [ ] Auto-upload to the student app, mapped to timetable period, subject and chapter
- [ ] Live/hybrid class (Meet/Zoom launch, or native WebRTC)

**Attendance and ERP**
- [ ] Board knows the timetable (auto-loads class, section, subject and period from the ERP)
- [ ] Attendance on board (manual or face), synced to ERP and to parent notifications
- [ ] Push notes, homework and tests from board to student app
- [ ] Student performance and learning-gap reports

**Admin and principal (VisionX parity)**
- [ ] Live board mirror of any classroom; optional camera and audio (consent-gated)
- [ ] Broadcast announcements and alerts to all or selected boards; logs
- [ ] Teacher usage analytics (minutes taught, syllabus coverage, AI usage, recordings)
- [ ] Console on web, Android and Windows/Mac

**Connectivity, security and device**
- [ ] Teacher login by QR, NFC (if the device has it) or PIN; role-based access
- [ ] Device management: remote app updates, kiosk mode, lock, schedule, health status
- [ ] Encrypted sync; DPDP-compliant data handling
- [ ] Offline-first board, with sync when back online

**Onboarding and support**
- [ ] In-app guided onboarding and micro-tutorials; teacher certification track
- [ ] Remote training and refresher webinars; community or forum; fast support SLA

### 5.2 Differentiators: where KINETIX can win

1. **Bring-your-own-screen economics.** A ₹15–25k Android tablet plus an existing projector or TV gives a 20–40 inch-equivalent classroom board for **under 10–20% of a Teachmint X**. Publish a TCO calculator (for example, "40 classrooms: ₹1 Cr vs ₹10 lakh"). The same app runs on any Android or Windows IFP (BenQ, Senses, ViewSonic, no-brand), so schools that already own panels can **add the AI plus ERP layer without replacing hardware**. That hits Teachmint's lock-in (G1, G2).
2. **Tablet-as-wand mobility.** The teacher walks the room holding the tablet. Writing mirrors to the projector, so there is no turning their back to the class. Students' tablets or phones can be handed the pen (permissioned "pass the pen"). An IFP fixed to the wall cannot do this.
3. **Curriculum-grounded AI, not generic LLM.** RAG over a licensed or owned, chapter-mapped corpus: NCERT/CBSE, CISCE (ICSE/ISC), **Karnataka State Board (KSEEB SSLC, PUC/DPUE)** and other state boards, plus **Bangalore University NEP UG/PG syllabi**. Every AI answer cites the textbook page. A "hallucination guard" flags content outside the syllabus. Teachmint has no visible owned corpus (G7).
4. **Real regional-language depth.** Kannada and Hindi UI, **Kannada handwriting recognition**, bilingual board (English term plus Kannada explanation), live Kannada/Hindi subtitles of the teacher's speech for the board and recordings, and TTS read-aloud. Target Kannada-medium and bilingual schools explicitly (G8).
5. **Closed loop with our own ERP, which Teachmint de-emphasises (G3).**
   - The period starts and the board auto-opens the right class and chapter from the **lesson-plan / syllabus tracker**. The period ends and coverage auto-updates against the plan. Principals see syllabus lag per section.
   - The in-class quiz feeds the gradebook, which feeds the **parent app**. The parent gets "Today in Class 7B Science: summary, homework and recording" in Kannada, English or Hindi on WhatsApp or the app.
   - Absentees automatically receive the recording and notes, and the attendance alert goes to parents at once.
   - Fee, transport and announcements reach the board's lock screen and broadcast.
6. **Higher-education mode (G9).** For Bangalore University UG/PG colleges: CO/PO mapping of each lecture, automatic **NAAC/OBE evidence** (attendance plus lecture logs plus assessments), internal-assessment (IA) marks capture, Moodle/LTI export, and long-form lecture capture with chapters and searchable transcripts.
7. **Privacy-first admin visibility (G10).** Offer board mirroring and teaching analytics **without default live camera or audio**. Camera and audio only with explicit, logged, time-boxed consent; DPDP-compliant retention; face templates kept on-device. This becomes a selling point to teachers' unions, parents and trusts.
8. **Zero-hardware student response.** Paper QR cards scanned by the tablet camera (Plickers-style) for phone-free classrooms, plus a student-phone or tablet web app (no install, join by code). No ₹-per-pad clickers (G11).
9. **Offline-first with on-device AI.** Board, recordings, attendance and a quantised on-device model (math OCR, handwriting recognition, short summaries, translation) work offline. A sync queue uploads when connected. This targets tier-2/3 and government-aided schools (G14).
10. **Reliability as a feature (G4, G5).** Student tests autosave every answer locally (fixing Teachmint's "app crashed, progress lost" complaint). Crash-free-session SLA, in-app support chat with response time shown, and an honest public status page.
11. **Transparent SaaS pricing.** Per-classroom or per-student annual pricing published on the website. Free tier for a single teacher. No post-warranty AI surprises (G12).
12. **Beyond-parity AI ideas.**
    - "Explain differently": the teacher circles a concept and AI gives a simpler analogy, a local-context example (a Bengaluru metro, a Karnataka farm) or a diagram.
    - Live **doubt board**: students submit anonymous questions from phones, AI clusters them, and the teacher answers the top clusters.
    - **Board-to-notes**: messy handwriting becomes clean typeset notes (LaTeX for maths, chemical equations), shared as PDFs.
    - Board-exam practice generator in **CBSE/KSEEB blueprint format** (marks distribution, competency-based questions).
    - Per-student remedial worksheets auto-generated from quiz errors.
    - Teacher co-pilot voice commands ("next slide", "open last class", "start 5-minute timer", "mark attendance") in English, Kannada or Hindi.
    - Camera gesture control and circle-to-search, matching BenQ RP05 so that Teachmint is not the only benchmark.
    - Accessibility: dyslexia font and overlays, immersive reader, captions (matches ViewSonic).
    - Safe casting: an AI filter on student-cast content (matches BenQ AI Guardian).
13. **Fast deployment.** Install from the Play Store or an MSI, log in with the school's ERP code, and the timetable and rosters are auto-provisioned. "Live in 15 minutes per classroom", against Teachmint's "one day with installer".

### 5.3 Risks to watch for KINETIX
- **Tablet ergonomics on a projector.** Latency over the HDMI/USB-C to projector chain, and how readable it is in a sunlit room. Recommend specific tested tablet and projector combinations, plus a low-cost stylus.
- **No large touch surface.** Students cannot walk up and write unless they use a tablet or phone. Mitigate with "pass the pen" and IFP support.
- **Content licensing costs** for a curriculum-grounded RAG corpus (NCERT is openly available; state-board and private publishers' books need licences).
- **Fast parity moves by EDLA OEMs.** BenQ and ViewSonic already ship most EduAI-equivalent features. The moat must be **ERP closed loop, curriculum grounding, regional language, cost and any-screen support**, not individual AI widgets.

---

*Verification to-do:* get a live demo or reseller quote for an X2 Neo (current price; EduAI renewal fees; VisionX pricing; Kannada support; offline AI list; MDM features; whether the ERP is still sold separately). Re-fetch teachmint.com pages from a network without the egress block to confirm the items marked (U).
