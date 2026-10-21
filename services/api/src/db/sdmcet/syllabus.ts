/**
 * SDMCET demo syllabus: VTU 2022-scheme style subjects per programme and semester, each with five
 * modules of real topics and a standard textbook. Codes follow the VTU pattern (BCS304, 22MBA11…)
 * for the demo; the institution's own syllabus import replaces them.
 *
 * A subject is [code, name, textbook, modules]; `modules` has one line per module:
 * `Module title: topic; topic; topic`.
 */
export type SubjectDef = readonly [code: string, name: string, book: string, modules: string];

const RM_IPR: SubjectDef = [
  'BRMK557',
  'Research Methodology and IPR',
  'Research Methodology: Methods and Techniques | C. R. Kothari, Gaurav Garg',
  `Introduction to Research: Meaning and objectives of research; Types of research; Research process; Criteria of good research
Literature Review and Research Design: Reviewing the literature; Formulating the research problem; Features of a good research design; Experimental designs
Data Collection and Analysis: Primary and secondary data; Sampling design; Hypothesis testing; Interpretation and report writing
Intellectual Property: Introduction to IPR; Patents and the patenting process; Copyright and related rights; Trademarks and industrial designs
Ethics and Publication: Research ethics and plagiarism; Citation and referencing styles; Writing a research paper; Open access and peer review`,
];

export const SYLLABUS: Record<string, readonly SubjectDef[]> = {
  'cse-3': [
    [
      'BCS301',
      'Mathematics for Computer Science (Mathematics III)',
      'Probability and Statistics for Engineers and Scientists | Walpole, Myers, Myers, Ye',
      `Probability Distributions: Random variables; Binomial distribution; Poisson distribution; Normal distribution; Exponential distribution
Joint Probability and Markov Chains: Joint probability distributions; Covariance and correlation; Stochastic matrices; Markov chains and steady state
Statistical Inference I: Sampling distributions; Central limit theorem; Standard error; Confidence intervals
Statistical Inference II: Testing of hypothesis; Type I and Type II errors; Z-test for means; t-test for small samples
Design of Experiments and ANOVA: Chi-square test of goodness of fit; Analysis of variance; One-way classification; Two-way classification`,
    ],
    [
      'BCS302',
      'Digital Design and Computer Organization',
      'Digital Design | M. Morris Mano, Michael D. Ciletti',
      `Introduction to Digital Design: Binary logic and logic gates; Boolean algebra; Karnaugh map simplification; NAND and NOR implementation
Combinational Logic: Adders and subtractors; Multiplexers and decoders; Encoders and comparators; Introduction to Verilog HDL
Sequential Logic: SR, JK, D and T flip-flops; Registers and shift registers; Counters; Analysis of clocked sequential circuits
Basic Structure of Computers: Functional units; Basic operational concepts; Instruction formats and addressing modes; Memory locations and addresses
Input/Output and Memory Organization: Interrupts and DMA; Cache memory and mapping functions; Pipelining basics; Basic processing unit`,
    ],
    [
      'BCS303',
      'Operating Systems',
      'Operating System Concepts | Silberschatz, Galvin, Gagne',
      `Introduction to Operating Systems: Operating system structure and services; System calls; Process concept; Process scheduling and operations on processes
CPU Scheduling and Threads: Multithreading models; Scheduling criteria; FCFS, SJF and Round Robin scheduling; Priority and multilevel queue scheduling
Process Synchronization and Deadlocks: The critical section problem; Semaphores and mutex locks; Classic synchronization problems; Deadlock prevention and Banker's algorithm
Memory Management: Contiguous memory allocation; Paging and segmentation; Virtual memory and demand paging; Page replacement algorithms
File Systems and Storage: File concept and access methods; Directory structure; File allocation methods; Disk scheduling`,
    ],
    [
      'BCS304',
      'Data Structures and Applications',
      'Fundamentals of Data Structures in C | Horowitz, Sahni, Anderson-Freed',
      `Introduction to Data Structures: Classification of data structures; Pointers and dynamic memory allocation; Arrays and structures; Polynomials and sparse matrices
Stacks and Queues: Stack operations and applications; Infix to postfix conversion; Queues and circular queues; Multiple stacks and queues
Linked Lists: Singly linked lists; Doubly linked lists; Circular linked lists; Polynomial addition using linked lists
Trees: Binary trees and traversals; Threaded binary trees; Binary search trees; Expression trees
Graphs, Hashing and Sorting: Graph representations; BFS and DFS traversal; Hashing and collision resolution; Priority queues and heap sort`,
    ],
    [
      'BCS306A',
      'Object Oriented Programming with Java',
      'Java: The Complete Reference | Herbert Schildt',
      `Java Fundamentals: Object-oriented programming principles; Data types, variables and arrays; Operators and control statements; Type conversion and casting
Classes and Methods: Class fundamentals and objects; Constructors and the this keyword; Method overloading; Static and final members
Inheritance and Interfaces: Inheritance basics and super; Method overriding; Abstract classes; Interfaces and default methods
Packages and Exceptions: Packages and access protection; Exception handling with try and catch; Throw, throws and finally; Custom exceptions
Multithreading and Collections: The Java thread model; Creating threads and synchronization; Enumerations and autoboxing; Collections framework: ArrayList and HashMap`,
    ],
  ],
  'cse-5': [
    [
      'BCS501',
      'Software Engineering and Project Management',
      'Software Engineering: A Practitioner\'s Approach | Roger S. Pressman',
      `Software and Software Engineering: Nature of software; Software process models; Waterfall and incremental models; Agile development and Scrum
Requirements Engineering: Requirements elicitation; Use cases and scenarios; Requirements modelling; Software requirements specification
Design Concepts: Design principles and abstraction; Architectural design; Component-level design; UML class and sequence diagrams
Software Testing: Unit and integration testing; Black-box and white-box testing; Validation and system testing; Debugging techniques
Project Management: Project planning and estimation; COCOMO model; Risk management; Software configuration management`,
    ],
    [
      'BCS502',
      'Computer Networks',
      'Computer Networking: A Top-Down Approach | James F. Kurose, Keith W. Ross',
      `Introduction to Networks: Network types and topologies; The OSI and TCP/IP models; Packet switching versus circuit switching; Delay, loss and throughput
Data Link Layer: Framing and error detection; CRC and Hamming codes; Ethernet and MAC addressing; Wireless LANs (IEEE 802.11)
Network Layer: IPv4 addressing and subnetting; Routing algorithms: link state and distance vector; IPv6; ICMP and NAT
Transport Layer: UDP; TCP connection management; Flow control and congestion control; Sockets programming
Application Layer: HTTP and the web; DNS; Electronic mail: SMTP; Network security basics`,
    ],
    [
      'BCS503',
      'Theory of Computation',
      'Introduction to Automata Theory, Languages and Computation | Hopcroft, Motwani, Ullman',
      `Finite Automata: Alphabets, strings and languages; Deterministic finite automata; Nondeterministic finite automata; NFA to DFA conversion
Regular Expressions and Languages: Regular expressions; Finite automata and regular expressions; Pumping lemma for regular languages; Minimization of DFA
Context-Free Grammars: Derivations and parse trees; Ambiguity in grammars; Chomsky normal form; Greibach normal form
Pushdown Automata: Definition of PDA; Acceptance by final state and empty stack; Equivalence of PDA and CFG; Pumping lemma for CFLs
Turing Machines and Undecidability: Turing machine model; Variants of Turing machines; The halting problem; Post correspondence problem`,
    ],
    [
      'BCS515B',
      'Artificial Intelligence',
      'Artificial Intelligence: A Modern Approach | Stuart Russell, Peter Norvig',
      `Introduction and Intelligent Agents: What is AI; Agents and environments; Rationality; Structure of agents
Problem Solving by Search: Problem-solving agents; Uninformed search: BFS and DFS; Informed search: A* algorithm; Heuristic functions
Adversarial Search and CSPs: Minimax algorithm; Alpha-beta pruning; Constraint satisfaction problems; Backtracking search
Knowledge and Reasoning: Knowledge-based agents; Propositional logic; First-order logic; Inference in first-order logic
Learning and Uncertainty: Quantifying uncertainty and Bayes rule; Learning from examples; Decision trees; Neural networks and gradient descent`,
    ],
    RM_IPR,
  ],
  'ece-3': [
    [
      'BMATEC301',
      'Mathematics III for Electronics and Communication',
      'Higher Engineering Mathematics | B. S. Grewal',
      `Fourier Series: Periodic functions and Dirichlet conditions; Fourier series of period 2L; Half-range Fourier series; Practical harmonic analysis
Fourier Transforms: Infinite Fourier transform; Fourier sine and cosine transforms; Inverse Fourier transform; Properties of Fourier transforms
Z-Transforms: Definition and standard Z-transforms; Damping and shifting rules; Inverse Z-transform; Solving difference equations
Complex Analysis: Analytic functions; Cauchy-Riemann equations; Conformal mapping; Cauchy integral formula
Probability and Random Variables: Random variables; Binomial and Poisson distributions; Normal distribution; Joint probability distributions`,
    ],
    [
      'BEC302',
      'Digital System Design using Verilog',
      'Digital Design | M. Morris Mano, Michael D. Ciletti',
      `Principles of Combinational Logic: Canonical forms; Karnaugh maps; Quine-McCluskey method; Incompletely specified functions
Combinational Circuit Design: Adders and carry look-ahead; Multiplexers and demultiplexers; Decoders and encoders; Magnitude comparators
Sequential Circuits: Latches and flip-flops; Shift registers; Synchronous counters; Mealy and Moore state machines
Introduction to Verilog: Verilog modules and ports; Data types and operators; Dataflow modelling; Behavioural modelling
Verilog for Digital Systems: Modelling combinational circuits; Modelling flip-flops and counters; Testbenches and simulation; FPGA design flow`,
    ],
    [
      'BEC303',
      'Electronic Principles and Circuits',
      'Electronic Devices and Circuit Theory | Robert L. Boylestad, Louis Nashelsky',
      `Semiconductor Physics and Diodes: Atomic structure and energy bands; PN junction diode; Diode rectifiers; Zener diode as a regulator
BJT Biasing: Transistor operation; Fixed bias and voltage divider bias; Load line analysis; Bias stabilization
Small Signal Amplifiers: The re transistor model; Common emitter amplifier; Frequency response; Cascaded amplifiers
Feedback Amplifiers and Oscillators: Concept of feedback; Negative feedback topologies; Barkhausen criterion; RC phase shift and crystal oscillators
Power Amplifiers and FETs: Class A and Class B amplifiers; Push-pull amplifiers; JFET characteristics; MOSFET operation`,
    ],
    [
      'BEC304',
      'Network Analysis',
      'Engineering Circuit Analysis | Hayt, Kemmerly, Durbin',
      `Basic Concepts: Electric circuit elements; Kirchhoff's laws; Source transformation; Mesh and nodal analysis
Network Theorems: Superposition theorem; Thevenin's and Norton's theorems; Maximum power transfer theorem; Millman's theorem
Transient Behaviour: Initial conditions; RL circuit transients; RC circuit transients; RLC circuit response
Laplace Transform Applications: Laplace transform of waveforms; Circuit analysis using Laplace transform; Initial and final value theorems; Network functions
Resonance and Two-Port Networks: Series resonance; Parallel resonance and Q factor; Z and Y parameters; h and transmission parameters`,
    ],
    [
      'BEC306C',
      'Computer Organization and ARM Microcontrollers',
      'ARM System Developer\'s Guide | Andrew Sloss, Dominic Symes, Chris Wright',
      `Basic Structure of Computers: Functional units; Bus structures; Instruction set architecture; Addressing modes
Memory System: Memory hierarchy; Cache memories; Virtual memory; Secondary storage
ARM Embedded Systems: The RISC design philosophy; ARM processor fundamentals; Registers and pipeline; Exceptions and interrupts
ARM Instruction Set: Data processing instructions; Branch and load-store instructions; Software interrupt instruction; Conditional execution
Programming ARM: Writing assembly code; Embedded C for ARM; Interfacing LEDs and switches; Timers and UART`,
    ],
  ],
  'ece-5': [
    [
      'BEC501',
      'Technological Innovation Management and Entrepreneurship',
      'Innovation Management and New Product Development | Paul Trott',
      `Management Fundamentals: Nature and functions of management; Planning; Organizing and staffing; Directing and controlling
Entrepreneurship: Concept of an entrepreneur; Entrepreneurial development; Stages of entrepreneurial process; Barriers to entrepreneurship
Innovation: Types of innovation; Innovation process; Design thinking; Technology transfer
Business Planning: Idea generation and opportunity identification; Feasibility study; Business model canvas; Preparing a project report
Funding and Support: Sources of finance; Venture capital and angel investors; Government schemes: Startup India; Intellectual property for startups`,
    ],
    [
      'BEC502',
      'Digital Signal Processing',
      'Digital Signal Processing: Principles, Algorithms and Applications | John G. Proakis, Dimitris G. Manolakis',
      `Discrete Fourier Transform: Frequency domain sampling; DFT as a linear transformation; Properties of DFT; Circular convolution
Fast Fourier Transform: Linear filtering using DFT; Overlap-save and overlap-add methods; Radix-2 decimation in time FFT; Radix-2 decimation in frequency FFT
FIR Filter Design: Characteristics of FIR filters; Linear phase FIR filters; Design using windows; Frequency sampling method
IIR Filter Design: Analog filter approximations; Butterworth filters; Impulse invariance; Bilinear transformation
Realization of Digital Filters: Direct form structures; Cascade and parallel forms; Lattice structures; Introduction to DSP processors`,
    ],
    [
      'BEC503',
      'Principles of Communication Systems',
      'Communication Systems | Simon Haykin, Michael Moher',
      `Amplitude Modulation: Amplitude modulation and spectrum; DSB-SC modulation; SSB and VSB modulation; Superheterodyne receiver
Angle Modulation: Frequency modulation; Phase modulation; Bandwidth of FM: Carson's rule; FM demodulation
Noise in Communication: Sources of noise; Noise figure and noise temperature; Noise in AM receivers; Noise in FM receivers
Sampling and Pulse Modulation: Sampling theorem; Pulse amplitude modulation; Quantization; Pulse code modulation
Digital Transmission: Delta modulation; Line codes; Time division multiplexing; Optical fibre communication and refraction`,
    ],
    [
      'BEC504',
      'Electromagnetic Waves',
      'Engineering Electromagnetics | William H. Hayt, John A. Buck',
      `Electrostatics: Coulomb's law and electric field intensity; Electric flux density and Gauss's law; Divergence theorem; Electric potential
Magnetostatics: Biot-Savart law; Ampere's circuital law; Curl and Stokes' theorem; Magnetic flux density
Time-Varying Fields: Faraday's law of electromagnetic induction; Displacement current; Maxwell's equations; Boundary conditions
Uniform Plane Waves: Wave propagation in free space; Waves in dielectrics and conductors; Skin effect; Poynting theorem
Transmission Lines: Transmission line equations; Reflection coefficient and VSWR; Smith chart; Impedance matching`,
    ],
    [
      'BEC515A',
      'Computer Communication Networks',
      'Data Communications and Networking | Behrouz A. Forouzan',
      `Networking Basics: Data communication components; Network topologies; Protocol layering; Packet switching
Data Link Control: Error detection and correction; Hamming codes; Stop-and-wait and sliding window; Random access: CSMA/CD
Wired and Wireless LANs: Ethernet; Wireless LAN architecture; Bluetooth; Connecting devices: switches and routers
Network Layer: IPv4 addresses; Unicast routing; Distance vector routing; Link state routing
Transport and Application: UDP and TCP; Congestion control; DNS; World Wide Web and HTTP`,
    ],
  ],
  'mech-3': [
    [
      'BMATM301',
      'Mathematics III for Mechanical Engineering',
      'Higher Engineering Mathematics | B. S. Grewal',
      `Fourier Series: Periodic functions; Fourier series expansion; Half-range series; Harmonic analysis
Partial Differential Equations: Formation of PDEs; Solution by direct integration; Method of separation of variables; One-dimensional heat equation
Numerical Methods I: Solution of algebraic equations: Newton-Raphson; Finite differences and interpolation; Numerical integration: Simpson's rules; Numerical solution of ODEs: Runge-Kutta method
Vector Calculus: Gradient, divergence and curl; Line integrals; Green's theorem; Stokes' and Gauss divergence theorems
Statistics and Curve Fitting: Correlation and regression; Method of least squares; Fitting a straight line and parabola; Probability distributions`,
    ],
    [
      'BME301',
      'Manufacturing Processes',
      'Manufacturing Technology Vol. 1 | P. N. Rao',
      `Introduction to Casting: Classification of manufacturing processes; Pattern making and allowances; Moulding sand and its properties; Gating and risering
Special Casting and Melting: Die casting; Centrifugal and investment casting; Cupola and induction furnaces; Casting defects
Welding Processes: Arc welding; Gas welding; Resistance welding; TIG and MIG welding
Metal Forming: Hot and cold working; Rolling and forging; Extrusion and wire drawing; Sheet metal operations
Powder Metallurgy and Additive Manufacturing: Powder production and compaction; Sintering; Introduction to 3D printing; Fused deposition modelling`,
    ],
    [
      'BME302',
      'Engineering Thermodynamics',
      'Engineering Thermodynamics | P. K. Nag',
      `Fundamental Concepts: Thermodynamic systems and properties; States of matter and phase change; Zeroth law and temperature; Work and heat transfer
First Law of Thermodynamics: First law for a closed system; Steady flow energy equation; Applications to nozzles and turbines; PMM1
Second Law of Thermodynamics: Kelvin-Planck and Clausius statements; Heat engines and refrigerators; Carnot cycle; Entropy and the Clausius inequality
Properties of Pure Substances: P-v and T-s diagrams; Steam tables; Mollier chart; Dryness fraction measurement
Ideal Gases and Gas Mixtures: Ideal gas equation; Real gases and compressibility; Van der Waals equation; Mixtures of ideal gases`,
    ],
    [
      'BME303',
      'Mechanics of Materials',
      'Mechanics of Materials | Ferdinand P. Beer, E. Russell Johnston',
      `Simple Stresses and Strains: Stress and strain; Hooke's law and elastic constants; Stress-strain diagram for mild steel; Thermal stresses
Compound Stresses: Stresses on inclined planes; Principal stresses and strains; Mohr's circle; Thin cylinders
Shear Force and Bending Moment: Types of beams and loads; SFD and BMD for cantilevers; SFD and BMD for simply supported beams; Point of contraflexure
Bending and Shear Stresses in Beams: Theory of simple bending; Section modulus; Shear stress distribution; Beams of uniform strength
Torsion and Columns: Torsion of circular shafts; Power transmitted by shafts; Euler's theory of columns; Rankine's formula`,
    ],
    [
      'BME304',
      'Material Science and Metallurgy',
      'Materials Science and Engineering: An Introduction | William D. Callister',
      `Structure of Materials: Atomic structure and bonding; Crystal structures: BCC, FCC and HCP; Miller indices; Crystal imperfections
Mechanical Behaviour: Elastic and plastic deformation; Tensile test; Hardness testing; Fatigue and creep
Phase Diagrams: Solid solutions and Hume-Rothery rules; Binary phase diagrams; Lever rule; Iron-carbon equilibrium diagram
Heat Treatment: TTT diagrams; Annealing and normalizing; Hardening and tempering; Surface hardening
Engineering Materials: Steels and cast irons; Non-ferrous alloys; Ceramics and polymers; Composite materials`,
    ],
  ],
  'mech-5': [
    [
      'BME501',
      'Theory of Machines',
      'Theory of Machines | S. S. Rattan',
      `Mechanisms: Kinematic links, pairs and chains; Degrees of freedom; Four-bar chain and inversions; Slider-crank mechanism
Velocity and Acceleration Analysis: Relative velocity method; Instantaneous centre method; Acceleration diagrams; Coriolis component
Gears and Gear Trains: Gear terminology; Law of gearing; Simple and compound gear trains; Epicyclic gear trains
Balancing: Static and dynamic balancing; Balancing of rotating masses; Balancing of reciprocating masses; Governors
Vibrations: Free undamped vibrations; Damped vibrations; Forced vibrations and resonance; Critical speed of shafts`,
    ],
    [
      'BME502',
      'Heat Transfer',
      'Heat and Mass Transfer: Fundamentals and Applications | Yunus A. Cengel, Afshin J. Ghajar',
      `Conduction Basics: Modes of heat transfer; Fourier's law; General heat conduction equation; Thermal resistance networks
Steady and Transient Conduction: Conduction through plane walls and cylinders; Critical thickness of insulation; Fins and fin efficiency; Lumped system analysis
Convection: Boundary layer concepts; Forced convection over flat plates; Flow in tubes; Natural convection
Heat Exchangers: Types of heat exchangers; LMTD method; Effectiveness-NTU method; Fouling factors
Radiation and Mass Transfer: Black body radiation laws; View factors; Radiation exchange between surfaces; Fick's law of diffusion`,
    ],
    [
      'BME503',
      'Fluid Mechanics and Turbomachines',
      'Fluid Mechanics and Hydraulic Machines | R. K. Bansal',
      `Fluid Properties and Statics: Properties of fluids and viscosity; Pascal's law and hydrostatic pressure; Manometers; Buoyancy and metacentre
Fluid Kinematics and Dynamics: Types of flow; Continuity equation; Bernoulli's equation; Venturimeter and orifice meter
Flow through Pipes: Laminar flow: Hagen-Poiseuille; Darcy-Weisbach equation; Major and minor losses; Pipes in series and parallel
Hydraulic Turbines: Impact of jets; Pelton wheel; Francis turbine; Kaplan turbine
Pumps and Compressors: Centrifugal pumps; Reciprocating pumps; Cavitation; Centrifugal compressors`,
    ],
    [
      'BME504',
      'Design of Machine Elements',
      'Design of Machine Elements | V. B. Bhandari',
      `Design Fundamentals: The design process; Materials and factor of safety; Static strength and theories of failure; Stress concentration
Fatigue Design: Endurance limit; S-N curve; Goodman and Soderberg criteria; Cumulative fatigue damage
Shafts, Keys and Couplings: Design of shafts for strength and rigidity; Design of keys; Rigid couplings; Flexible couplings
Joints: Riveted joints; Welded joints; Threaded fasteners; Bolted joints under eccentric loading
Springs: Helical compression springs; Spring materials; Leaf springs; Energy storage in springs`,
    ],
    [
      'BME505',
      'Industrial Management and Entrepreneurship',
      'Industrial Engineering and Management | O. P. Khanna',
      `Management Principles: Evolution of management thought; Functions of management; Planning and decision making; Organizational structures
Production Planning: Plant location and layout; Production planning and control; Work study and method study; Time study
Quality Management: Statistical quality control; Control charts; Total quality management; Six Sigma
Entrepreneurship: Entrepreneurial traits; Small scale industries; Project identification; Business plan
Industrial Safety and Economics: Industrial safety; Break-even analysis; Depreciation; Engineering economics and cash flow`,
    ],
  ],
  'civil-3': [
    [
      'BMATC301',
      'Mathematics III for Civil Engineering',
      'Higher Engineering Mathematics | B. S. Grewal',
      `Fourier Series: Periodic functions; Fourier series of period 2L; Half-range series; Harmonic analysis
Laplace Transforms: Laplace transform of standard functions; Properties of Laplace transforms; Inverse Laplace transform; Solution of differential equations
Numerical Methods: Newton-Raphson method; Interpolation; Numerical integration; Runge-Kutta method
Vector Calculus: Gradient, divergence and curl; Line and surface integrals; Green's theorem; Gauss divergence theorem
Probability and Statistics: Correlation and regression; Curve fitting by least squares; Binomial and Poisson distributions; Normal distribution`,
    ],
    [
      'BCV302',
      'Strength of Materials',
      'Strength of Materials | R. K. Bansal',
      `Simple Stresses and Strains: Stress, strain and elastic constants; Composite sections; Thermal stresses; Strain energy
Shear Force and Bending Moment: Types of supports and loads; SFD and BMD for cantilevers; SFD and BMD for overhanging beams; Point of contraflexure
Stresses in Beams: Theory of simple bending; Bending stress distribution; Shear stress distribution; Flitched beams
Deflection of Beams: Double integration method; Macaulay's method; Moment area method; Conjugate beam method
Torsion and Columns: Torsion of circular shafts; Euler's buckling load; Effective length of columns; Rankine-Gordon formula`,
    ],
    [
      'BCV303',
      'Fluid Mechanics and Hydraulics',
      'A Textbook of Fluid Mechanics and Hydraulic Machines | R. K. Rajput',
      `Fluid Properties: Density, viscosity and surface tension; Capillarity; Newtonian and non-Newtonian fluids; Vapour pressure and cavitation
Fluid Statics: Pressure measurement and manometers; Total pressure on surfaces; Centre of pressure; Buoyancy and floatation
Fluid Kinematics: Types of flow; Continuity equation; Velocity potential and stream function; Flow nets
Fluid Dynamics: Euler's equation; Bernoulli's equation; Flow measurement: venturimeter; Momentum equation
Open Channel Flow: Uniform flow: Chezy and Manning formulae; Most economical channel sections; Specific energy and critical depth; Hydraulic jump`,
    ],
    [
      'BCV304',
      'Surveying',
      'Surveying Vol. 1 | B. C. Punmia',
      `Introduction to Surveying: Principles and classification of surveying; Chain surveying; Errors in chaining; Ranging and offsets
Compass Surveying: Bearings and meridians; Prismatic compass; Local attraction; Traverse adjustment by Bowditch rule
Levelling: Levelling instruments; Reduction of levels; Profile levelling; Contouring
Theodolite Surveying: Temporary adjustments; Measurement of horizontal angles; Trigonometric levelling; Total station
Curves and Modern Surveying: Simple circular curves; Setting out curves; GPS and GNSS; Remote sensing and GIS basics`,
    ],
    [
      'BCV305',
      'Engineering Geology',
      'Engineering and General Geology | Parbin Singh',
      `Introduction and Earth Structure: Scope of geology in civil engineering; Interior of the earth; Plate tectonics; Earthquakes and seismic zones of India
Mineralogy: Physical properties of minerals; Rock-forming minerals; Ore minerals; Identification of minerals
Petrology: The rock cycle; Igneous rocks; Sedimentary rocks; Metamorphic rocks
Structural Geology: Folds; Faults; Joints; Dip and strike
Geology for Engineering Projects: Geological investigations for dams; Tunnels and geology; Landslides; Groundwater and the hydrological cycle`,
    ],
  ],
  'civil-5': [
    [
      'BCV501',
      'Analysis of Indeterminate Structures',
      'Structural Analysis | R. C. Hibbeler',
      `Introduction: Static and kinematic indeterminacy; Principle of virtual work; Castigliano's theorems; Unit load method
Slope Deflection Method: Slope deflection equations; Continuous beams; Portal frames without sway; Portal frames with sway
Moment Distribution Method: Stiffness and carry-over factors; Distribution factors; Continuous beams; Frames with sway
Kani's Method: Rotation factors; Continuous beams; Frames without sway; Frames with sway
Matrix Methods: Flexibility matrix method; Stiffness matrix method; Analysis of beams; Introduction to finite element analysis`,
    ],
    [
      'BCV502',
      'Geotechnical Engineering',
      'Soil Mechanics and Foundation Engineering | B. C. Punmia',
      `Soil Properties: Origin of soils and the rock cycle; Phase relationships; Index properties; Soil classification
Permeability and Seepage: Darcy's law; Permeability tests; Seepage and flow nets; Effective stress principle
Compaction and Consolidation: Proctor compaction test; Field compaction; Terzaghi's consolidation theory; Settlement computation
Shear Strength: Mohr-Coulomb failure criterion; Direct shear test; Triaxial test; Unconfined compression test
Foundations and Slopes: Bearing capacity: Terzaghi's theory; Earth pressure theories; Stability of slopes; Site investigation`,
    ],
    [
      'BCV503',
      'Hydrology and Irrigation Engineering',
      'Engineering Hydrology | K. Subramanya',
      `Hydrology Basics: The hydrological cycle; Precipitation and its measurement; Rainfall analysis; Evaporation and transpiration
Runoff and Hydrographs: Infiltration; Runoff estimation; Unit hydrograph; Flood estimation
Groundwater: Aquifers; Well hydraulics; Dupuit's equation; Groundwater recharge
Irrigation: Need for irrigation; Methods of irrigation: drip and sprinkler; Crop water requirements; Duty and delta
Canals and Dams: Canal design: Kennedy's and Lacey's theories; Canal lining; Types of dams; Spillways`,
    ],
    [
      'BCV504',
      'Water Supply and Treatment Engineering',
      'Water Supply Engineering | S. K. Garg',
      `Water Demand and Sources: Population forecasting; Water demand; Surface and groundwater sources; Intake structures
Water Quality: Physical and chemical characteristics; Biological characteristics; Drinking water standards: BIS 10500; Water-borne diseases
Water Treatment I: Aeration; Sedimentation; Coagulation and flocculation; Filtration
Water Treatment II: Disinfection by chlorination; Softening; Reverse osmosis and membrane processes; Defluoridation
Distribution Systems: Distribution layouts; Pipe network analysis: Hardy Cross; Storage reservoirs; Leak detection`,
    ],
    [
      'BCV515A',
      'Transportation Engineering',
      'Highway Engineering | S. K. Khanna, C. E. G. Justo',
      `Highway Development and Planning: Road development in India; Highway alignment; Engineering surveys; Classification of roads
Geometric Design: Cross-section elements; Sight distances; Superelevation; Horizontal and vertical curves
Pavement Materials: Subgrade soil and CBR test; Aggregates; Bitumen; Bituminous mix design
Pavement Design: Flexible pavements: IRC 37; Rigid pavements: IRC 58; Highway drainage; Pavement maintenance
Traffic Engineering: Traffic characteristics; Traffic surveys; Traffic signals; Intersection design`,
    ],
  ],
  'eee-3': [
    [
      'BMATE301',
      'Mathematics III for Electrical Engineering',
      'Higher Engineering Mathematics | B. S. Grewal',
      `Fourier Series: Periodic functions; Fourier series; Half-range series; Harmonic analysis
Fourier Transforms and Z-Transforms: Fourier transform; Fourier sine and cosine transforms; Z-transform; Inverse Z-transform
Laplace Transforms: Laplace transform of periodic functions; Unit step and impulse functions; Inverse Laplace transform; Solution of circuit equations
Complex Variables: Analytic functions; Cauchy-Riemann equations; Complex integration; Residue theorem
Statistics and Probability: Correlation and regression; Least squares fitting; Probability distributions; Joint distributions`,
    ],
    [
      'BEE302',
      'Electric Circuit Analysis',
      'Engineering Circuit Analysis | Hayt, Kemmerly, Durbin',
      `Basic Concepts: The electric circuit and Ohm's law; Kirchhoff's laws; Mesh analysis; Nodal analysis
Network Theorems: Superposition; Thevenin's and Norton's theorems; Maximum power transfer; Reciprocity theorem
AC Circuits and Resonance: Phasors and complex numbers; Series and parallel AC circuits; Power factor; Series and parallel resonance
Three-Phase Circuits: Star and delta connections; Balanced three-phase systems; Unbalanced loads; Power measurement by two-wattmeter method
Transients and Two-Port Networks: RL and RC transients; RLC transients; Two-port network parameters; Interconnection of two-ports`,
    ],
    [
      'BEE303',
      'Analog Electronic Circuits',
      'Electronic Devices and Circuit Theory | Robert L. Boylestad, Louis Nashelsky',
      `Diode Circuits: Semiconductor atomic structure; Diode clippers and clampers; Rectifiers and filters; Voltage multipliers
Transistor Biasing: Operating point; Voltage divider bias; Stability factor; Thermal runaway
Transistor Amplifiers: h-parameter model; CE, CB and CC amplifiers; Darlington pair; Frequency response
Feedback and Oscillators: Negative feedback; Barkhausen criterion; Wien bridge oscillator; Hartley and Colpitts oscillators
Operational Amplifiers: Op-amp characteristics; Inverting and non-inverting amplifiers; Summer and integrator; Comparators`,
    ],
    [
      'BEE304',
      'Transformers and Generators',
      'Electrical Machinery | P. S. Bimbhra',
      `Single-Phase Transformers: Construction and principle of operation; EMF equation; Equivalent circuit; Losses and efficiency
Transformer Testing: Open circuit and short circuit tests; Voltage regulation; All-day efficiency; Parallel operation
Three-Phase Transformers: Three-phase connections; Scott connection; Autotransformers; Tap changing
DC Generators: Electromagnetic induction and the generator principle; EMF equation; Armature reaction and commutation; Characteristics of DC generators
Synchronous Generators: Construction of alternators; EMF equation and winding factors; Voltage regulation: EMF and MMF methods; Synchronization and parallel operation`,
    ],
    [
      'BEE305',
      'Electrical and Electronic Measurements',
      'A Course in Electrical and Electronic Measurements and Instrumentation | A. K. Sawhney',
      `Measurement Fundamentals: Units and standards; Errors in measurement; Static characteristics; Dimensional analysis
Measurement of Resistance: Wheatstone bridge; Kelvin double bridge; Megger; Earth resistance measurement
AC Bridges: Maxwell's bridge; Hay's bridge; Schering bridge; Wien's bridge
Measurement of Power and Energy: Electrodynamometer wattmeter; Energy meters; Instrument transformers; Power factor meters
Electronic Instruments: Digital voltmeters; Cathode ray oscilloscope; Digital storage oscilloscope; Transducers`,
    ],
  ],
  'eee-5': [
    [
      'BEE501',
      'Power Electronics',
      'Power Electronics: Circuits, Devices and Applications | Muhammad H. Rashid',
      `Power Semiconductor Devices: Power diodes; Thyristors and their characteristics; Power MOSFETs; IGBTs
Controlled Rectifiers: Single-phase half-wave converters; Single-phase full converters; Three-phase converters; Effect of source inductance
Choppers: Step-down chopper; Step-up chopper; Chopper control strategies; Buck-boost converter
Inverters: Single-phase voltage source inverters; Three-phase inverters; PWM techniques; Current source inverters
AC Voltage Controllers and Applications: AC voltage controllers; Cycloconverters; Electric drives; Uninterruptible power supplies`,
    ],
    [
      'BEE502',
      'Transmission and Distribution',
      'Principles of Power System | V. K. Mehta, Rohit Mehta',
      `Power System Structure: Typical power supply scheme; Generation, transmission and distribution; Advantages of high voltage transmission; HVDC transmission
Line Parameters: Resistance; Inductance of transmission lines; Capacitance of transmission lines; Skin and proximity effects
Performance of Lines: Short transmission lines; Medium lines: nominal T and pi; Long transmission lines; Ferranti effect
Insulators and Cables: Types of insulators; String efficiency; Underground cables; Grading of cables
Distribution Systems: AC distribution; DC distribution; Corona; Sag in overhead lines`,
    ],
    [
      'BEE503',
      'Control Systems',
      'Control Systems Engineering | I. J. Nagrath, M. Gopal',
      `Modelling of Systems: Open loop and closed loop systems; Transfer functions; Mechanical and electrical systems; Block diagram reduction
Signal Flow Graphs and Time Response: Mason's gain formula; Standard test signals; First and second order systems; Steady state errors
Stability Analysis: Concept of stability; Routh-Hurwitz criterion; Root locus technique; Effect of adding poles and zeros
Frequency Response: Bode plots; Gain and phase margins; Polar plots; Nyquist stability criterion
Controllers and State Space: PID controllers; Lead and lag compensators; State space representation; Controllability and observability`,
    ],
    [
      'BEE504',
      'Renewable Energy Sources',
      'Non-Conventional Energy Sources | G. D. Rai',
      `Energy Scenario: Energy sources and their availability; India's energy scenario; Need for renewable energy; Environmental impact of energy use
Solar Energy: Solar radiation and the sun-earth geometry; Solar thermal collectors; Solar photovoltaic cells; Solar PV systems and MPPT
Wind Energy: Wind power basics; Wind turbine types; Wind energy conversion systems; Wind generators and induction
Other Sources: Biomass energy; Geothermal energy; Tidal and wave energy; Small hydro power
Storage and Grid Integration: Batteries and electrolysis of water; Hydrogen and fuel cells; Grid integration of renewables; Smart grid basics`,
    ],
    [
      'BEE515B',
      'Microcontrollers',
      'The 8051 Microcontroller and Embedded Systems | Muhammad Ali Mazidi',
      `8051 Architecture: Microprocessors versus microcontrollers; 8051 architecture; Memory organization; Registers and flags
Instruction Set: Addressing modes; Data transfer instructions; Arithmetic and logical instructions; Jump and call instructions
Programming in Assembly and C: Assembly programming; Embedded C for 8051; Time delay generation; I/O port programming
Timers, Serial Port and Interrupts: Timer programming; Serial communication; Interrupt programming; Priority of interrupts
Interfacing: LCD and keypad interfacing; ADC and DAC interfacing; Stepper motor control; DC motor control with PWM`,
    ],
  ],
  'mba-1': [
    [
      '22MBA11',
      'Management and Organizational Behaviour',
      'Organizational Behavior | Stephen P. Robbins, Timothy A. Judge',
      `Management Concepts: Nature and functions of management; Evolution of management thought; Planning and decision making; Organizing and controlling
Introduction to Organizational Behaviour: Meaning and scope of OB; Contributing disciplines; Challenges and opportunities for OB; OB models
Individual Behaviour: Personality; Perception; Learning; Attitudes and job satisfaction
Motivation and Leadership: Maslow's hierarchy of needs; Herzberg's two-factor theory; Leadership theories; Transformational leadership
Groups, Conflict and Change: Group dynamics; Team building; Conflict management; Organizational change and culture`,
    ],
    [
      '22MBA12',
      'Managerial Economics',
      'Managerial Economics | D. N. Dwivedi',
      `Introduction to Managerial Economics: Nature and scope; Circular flow of income; Opportunity cost; Incremental and marginal reasoning
Demand Analysis: Law of demand; Elasticity of demand; Demand forecasting; Supply and market equilibrium
Production and Cost: Production function; Law of variable proportions; Returns to scale; Cost curves and break-even analysis
Market Structures: Perfect competition; Monopoly; Monopolistic competition; Oligopoly and game theory
Macroeconomics for Managers: National income; Inflation; Business cycles; Monetary and fiscal policy`,
    ],
    [
      '22MBA13',
      'Accounting for Managers',
      'Financial Accounting for Management | Ambrish Gupta',
      `Introduction to Accounting: Accounting concepts and conventions; Double entry system; Journal and ledger; Trial balance
Final Accounts: Trading account; Profit and loss account; Balance sheet; Adjustments in final accounts
Depreciation and Inventory: Methods of depreciation; Inventory valuation: FIFO and weighted average; Indian Accounting Standards; IFRS overview
Financial Statement Analysis: Comparative statements; Common size statements; Ratio analysis; Cash flow statement
Cost and Management Accounting: Cost concepts; Marginal costing; Budgetary control; Standard costing and variance analysis`,
    ],
    [
      '22MBA14',
      'Business Statistics and Analytics',
      'Statistics for Management | Richard I. Levin, David S. Rubin',
      `Descriptive Statistics: Data collection and presentation; Measures of central tendency; Measures of dispersion; Skewness and kurtosis
Probability: Basic probability concepts; Bayes' theorem; Binomial distribution; Normal distribution
Correlation and Regression: Karl Pearson's correlation; Rank correlation; Simple linear regression; Multiple regression basics
Sampling and Hypothesis Testing: Sampling methods; Central limit theorem; Hypothesis testing; Chi-square test
Business Analytics: Introduction to business analytics; Time series analysis; Index numbers; Data visualization with Excel`,
    ],
    [
      '22MBA15',
      'Marketing Management',
      'Marketing Management | Philip Kotler, Kevin Lane Keller',
      `Marketing Concepts: Core marketing concepts; Marketing environment; Marketing mix; Start with why: purpose-driven brands
Consumer and Market Analysis: Consumer buying behaviour; Market segmentation; Targeting; Positioning
Product and Pricing: Product life cycle; New product development; Branding; Pricing strategies
Place and Promotion: Marketing channels; Retailing and wholesaling; Integrated marketing communication; Advertising and sales promotion
Contemporary Marketing: Digital marketing; Social media marketing; Rural marketing in India; Services marketing`,
    ],
    [
      '22MBA16',
      'Digital Business',
      'E-Commerce: Business, Technology, Society | Kenneth C. Laudon, Carol Guercio Traver',
      `Digital Business Foundations: Digital transformation; E-business models; The digital economy; Platform businesses
Internet Technologies: How the internet works; Packet switching and protocols; Cloud computing; Mobile platforms
E-Commerce: B2B and B2C commerce; Online payment systems: UPI; E-commerce security; Digital marketplaces
Data and AI in Business: Big data; Artificial intelligence and neural networks; Business intelligence; Data privacy and DPDP Act
Digital Strategy: Digital business strategy; Social commerce; Startup ecosystem in India; Ethics in digital business`,
    ],
  ],
  'mba-3': [
    [
      '22MBA31',
      'Strategic Management',
      'Strategic Management: Concepts and Cases | Fred R. David',
      `Introduction to Strategy: Strategic management process; Vision and mission; Strategic intent; Corporate governance
Environmental Analysis: PESTEL analysis; Porter's five forces; Industry analysis; Competitive intelligence
Internal Analysis: Resource-based view; Value chain analysis; Core competencies; SWOT analysis
Strategy Formulation: Generic competitive strategies; Corporate level strategies; BCG and GE matrices; Mergers and acquisitions
Strategy Implementation and Control: Structure and strategy; Leadership and culture; Balanced scorecard; Strategic control`,
    ],
    [
      '22MBAFM32',
      'Investment Analysis and Portfolio Management',
      'Investment Analysis and Portfolio Management | Prasanna Chandra',
      `Investment Basics: Investment alternatives; Risk and return; Time value of money; Financial markets in India
Securities Markets: Primary and secondary markets; Stock exchanges: NSE and BSE; SEBI regulations; Trading and settlement
Valuation: Bond valuation; Equity valuation; Dividend discount model; Price-earnings approach
Analysis: Fundamental analysis; Economy, industry and company analysis; Technical analysis; Efficient market hypothesis
Portfolio Management: Markowitz portfolio theory; CAPM; Sharpe and Treynor ratios; Portfolio revision`,
    ],
    [
      '22MBAMM33',
      'Consumer Behaviour',
      'Consumer Behavior | Leon G. Schiffman, Joseph Wisenblit',
      `Introduction to Consumer Behaviour: Scope and importance; Consumer research; Consumer decision-making process; Diversity of Indian consumers
Individual Determinants: Motivation; Personality and self-concept; Perception; Learning and attitudes
Social and Cultural Influences: Reference groups; Family and life cycle; Social class; Culture and subculture
Consumer Decision Making: Problem recognition; Information search; Evaluation of alternatives; Post-purchase behaviour
Contemporary Issues: Online consumer behaviour; Diffusion of innovations; Consumerism and ethics; Neuromarketing`,
    ],
    [
      '22MBAHR34',
      'Talent Management',
      'Talent Management Handbook | Lance A. Berger, Dorothy R. Berger',
      `Introduction to Talent Management: Concept and scope; Talent management process; War for talent; Talent management and strategy
Talent Acquisition: Workforce planning; Employer branding; Recruitment channels; Selection and assessment centres
Talent Development: Competency mapping; Learning and development; Career planning; Succession planning
Performance and Rewards: Performance management systems; 360-degree feedback; Compensation and rewards; Employee engagement
Talent Retention and Analytics: Retention strategies; Managing attrition; HR analytics; Talent management in Indian IT`,
    ],
    [
      '22MBABA35',
      'Business Analytics and Machine Learning',
      'Business Analytics: Data Analysis and Decision Making | S. Christian Albright, Wayne L. Winston',
      `Introduction to Analytics: Descriptive, predictive and prescriptive analytics; Analytics process; Data types; Analytics in Indian business
Data Preparation and Visualization: Data cleaning; Exploratory data analysis; Dashboards; Storytelling with data
Predictive Modelling: Linear regression; Logistic regression; Decision trees; Model evaluation
Machine Learning for Managers: Supervised and unsupervised learning; Clustering; Neural networks; Gradient descent intuition
Prescriptive Analytics: Linear programming; Simulation; Decision analysis; Bayes' theorem in decisions`,
    ],
  ],
  'mtech-1': [
    [
      '22SCS11',
      'Mathematical Foundations of Computer Science',
      'Discrete Mathematics and Its Applications | Kenneth H. Rosen',
      `Logic and Proofs: Propositional logic; Predicates and quantifiers; Rules of inference; Proof techniques
Linear Algebra: Vector spaces; Linear transformations; Eigenvalues and eigenvectors; Singular value decomposition
Probability: Random variables; Bayes' theorem; Common distributions; Central limit theorem
Graph Theory: Graphs and their representations; Connectivity; Trees and spanning trees; Graph colouring
Information Theory and Coding: Entropy; Mutual information; Hamming codes; Error-correcting codes`,
    ],
    [
      '22SCS12',
      'Advanced Algorithms',
      'Introduction to Algorithms | Cormen, Leiserson, Rivest, Stein',
      `Algorithm Analysis: Asymptotic notation; Recurrences and the master theorem; Amortized analysis; Peak finding and divide and conquer
Graph Algorithms: Shortest paths: Dijkstra and Bellman-Ford; All-pairs shortest paths; Maximum flow; Bipartite matching
String Matching and Number Theory: Rabin-Karp algorithm; Knuth-Morris-Pratt algorithm; Modular arithmetic; RSA cryptosystem
Advanced Design Techniques: Dynamic programming; Greedy algorithms; Randomized algorithms; Approximation algorithms
Computational Complexity: P and NP; NP-completeness; Reductions; Linear programming`,
    ],
    [
      '22SCS13',
      'Advances in Computer Networks',
      'Computer Networks: A Systems Approach | Larry L. Peterson, Bruce S. Davie',
      `Foundations: Network architecture; Packet switching; Performance metrics; Protocol implementation
Internetworking: Switching and bridging; IP and subnetting; Routing protocols: OSPF and BGP; IPv6
End-to-End Protocols: TCP internals; Congestion control algorithms; Queueing disciplines; Quality of service
Software-Defined Networking: SDN architecture; OpenFlow; Network function virtualization; Data centre networks
Wireless and Emerging Networks: Wireless networks and 5G; Internet of Things; Network security; Content delivery networks`,
    ],
    [
      '22SCS14',
      'Machine Learning',
      'Pattern Recognition and Machine Learning | Christopher M. Bishop',
      `Introduction to Machine Learning: Types of machine learning; Bias-variance trade-off; Model selection; Cross-validation
Supervised Learning: Linear regression and gradient descent; Logistic regression; Support vector machines; Decision trees and random forests
Unsupervised Learning: K-means clustering; Hierarchical clustering; Principal component analysis; Gaussian mixture models
Neural Networks: Perceptron; Multilayer neural networks; Backpropagation; Convolutional neural networks
Advanced Topics: Recurrent neural networks; Transformers and attention; Bayesian learning; Reinforcement learning`,
    ],
    ['22RMI15', RM_IPR[1], RM_IPR[2], RM_IPR[3]],
  ],
};

export interface ParsedModule {
  title: string;
  topics: string[];
}

/** Splits a subject's module text into modules and topics. */
export function parseModules(text: string): ParsedModule[] {
  return text
    .trim()
    .split('\n')
    .map((line) => {
      const i = line.indexOf(': ');
      return { title: line.slice(0, i).trim(), topics: line.slice(i + 2).split(';').map((t) => t.trim()).filter(Boolean) };
    });
}
