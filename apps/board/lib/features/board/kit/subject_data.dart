// Reference material for the subject kit: formula sheets (NCERT chapter names), constants,
// the periodic table, common ions and key dates. Ported from the KINETIX prototype. The
// reference text is in English, as in the textbooks the formulas come from; the kit's own
// words are translated.


class Formula {
  final String chapter;
  final String name;
  final String tex;
  const Formula(this.chapter, this.name, this.tex);
}

const mathsFormulas = <Formula>[
  // Exponents & number systems
  Formula('Exponents & powers', 'Product rule', r'a^m \cdot a^n = a^{m+n}'),
  Formula('Exponents & powers', 'Quotient rule', r'\frac{a^m}{a^n} = a^{m-n}'),
  Formula('Exponents & powers', 'Power of a power', r'(a^m)^n = a^{mn}'),
  Formula('Exponents & powers', 'Zero & negative', r'a^0 = 1, \quad a^{-n} = \frac{1}{a^n}'),
  Formula('Exponents & powers', 'Roots', r'a^{\frac{1}{n}} = \sqrt[n]{a}'),
  Formula('Number systems', 'Rationalising', r'\frac{1}{\sqrt{a}+\sqrt{b}} = \frac{\sqrt{a}-\sqrt{b}}{a-b}'),
  // Algebra
  Formula('Algebraic identities', 'Square of a sum', r'(a+b)^2 = a^2 + 2ab + b^2'),
  Formula('Algebraic identities', 'Square of a difference', r'(a-b)^2 = a^2 - 2ab + b^2'),
  Formula('Algebraic identities', 'Difference of squares', r'a^2 - b^2 = (a+b)(a-b)'),
  Formula('Algebraic identities', 'Product of binomials', r'(x+a)(x+b) = x^2 + (a+b)x + ab'),
  Formula('Algebraic identities', 'Cube of a sum', r'(a+b)^3 = a^3 + b^3 + 3ab(a+b)'),
  Formula('Algebraic identities', 'Cube of a difference', r'(a-b)^3 = a^3 - b^3 - 3ab(a-b)'),
  Formula('Algebraic identities', 'Sum of cubes', r'a^3 + b^3 = (a+b)(a^2 - ab + b^2)'),
  Formula('Algebraic identities', 'Difference of cubes', r'a^3 - b^3 = (a-b)(a^2 + ab + b^2)'),
  Formula('Algebraic identities', 'Three terms', r'(a+b+c)^2 = a^2+b^2+c^2+2ab+2bc+2ca'),
  Formula('Quadratic equations', 'Quadratic formula', r'x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}'),
  Formula('Quadratic equations', 'Discriminant', r'D = b^2 - 4ac'),
  Formula('Quadratic equations', 'Sum and product of roots', r'\alpha + \beta = -\frac{b}{a}, \quad \alpha\beta = \frac{c}{a}'),
  Formula('Linear equations', 'Slope', r'm = \frac{y_2 - y_1}{x_2 - x_1}'),
  Formula('Linear equations', 'Slope–intercept form', r'y = mx + c'),
  Formula('Linear equations', 'Pair of lines: unique solution', r'\frac{a_1}{a_2} \neq \frac{b_1}{b_2}'),
  Formula('Arithmetic progressions', 'nth term', r'a_n = a + (n-1)d'),
  Formula('Arithmetic progressions', 'Sum of n terms', r'S_n = \frac{n}{2}\left[2a + (n-1)d\right]'),
  Formula('Arithmetic progressions', 'Sum with last term', r'S_n = \frac{n}{2}(a + l)'),
  // Geometry
  Formula('Coordinate geometry', 'Distance', r'd = \sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}'),
  Formula('Coordinate geometry', 'Midpoint', r'\left(\frac{x_1+x_2}{2}, \frac{y_1+y_2}{2}\right)'),
  Formula('Coordinate geometry', 'Section formula', r'\left(\frac{m x_2 + n x_1}{m+n}, \frac{m y_2 + n y_1}{m+n}\right)'),
  Formula('Coordinate geometry', 'Area of a triangle', r'\tfrac{1}{2}\left|x_1(y_2-y_3)+x_2(y_3-y_1)+x_3(y_1-y_2)\right|'),
  Formula('Triangles', 'Angle sum', r'\angle A + \angle B + \angle C = 180^\circ'),
  Formula('Triangles', 'Pythagoras theorem', r'a^2 + b^2 = c^2'),
  Formula('Triangles', 'Similar triangles: areas', r'\frac{ar(\triangle ABC)}{ar(\triangle PQR)} = \left(\frac{AB}{PQ}\right)^2'),
  Formula('Circles', 'Angle at the centre', r'\angle AOB = 2\,\angle ACB'),
  Formula('Trigonometry', 'Ratios', r'\sin\theta = \frac{P}{H}, \ \cos\theta = \frac{B}{H}, \ \tan\theta = \frac{P}{B}'),
  Formula('Trigonometry', 'Identity 1', r'\sin^2\theta + \cos^2\theta = 1'),
  Formula('Trigonometry', 'Identity 2', r'1 + \tan^2\theta = \sec^2\theta'),
  Formula('Trigonometry', 'Identity 3', r'1 + \cot^2\theta = \csc^2\theta'),
  Formula('Trigonometry', 'Complementary angles', r'\sin(90^\circ - \theta) = \cos\theta'),
  // Mensuration
  Formula('Areas', 'Rectangle', r'A = l \times b, \quad P = 2(l+b)'),
  Formula('Areas', 'Triangle', r'A = \tfrac{1}{2} \times b \times h'),
  Formula("Areas", "Heron's formula", r'A = \sqrt{s(s-a)(s-b)(s-c)}, \ s = \tfrac{a+b+c}{2}'),
  Formula('Areas', 'Parallelogram', r'A = b \times h'),
  Formula('Areas', 'Trapezium', r'A = \tfrac{1}{2}(a+b)h'),
  Formula('Areas', 'Circle', r'A = \pi r^2, \quad C = 2\pi r'),
  Formula('Areas', 'Sector and arc', r'A = \frac{\theta}{360^\circ}\pi r^2, \quad l = \frac{\theta}{360^\circ}2\pi r'),
  Formula('Surface areas & volumes', 'Cuboid', r'V = lbh, \quad TSA = 2(lb+bh+hl)'),
  Formula('Surface areas & volumes', 'Cube', r'V = a^3, \quad TSA = 6a^2'),
  Formula('Surface areas & volumes', 'Cylinder', r'V = \pi r^2 h, \quad CSA = 2\pi r h'),
  Formula('Surface areas & volumes', 'Cone', r'V = \tfrac{1}{3}\pi r^2 h, \quad CSA = \pi r l, \ l = \sqrt{r^2+h^2}'),
  Formula('Surface areas & volumes', 'Sphere', r'V = \tfrac{4}{3}\pi r^3, \quad SA = 4\pi r^2'),
  Formula('Surface areas & volumes', 'Hemisphere', r'V = \tfrac{2}{3}\pi r^3, \quad TSA = 3\pi r^2'),
  Formula('Surface areas & volumes', 'Frustum', r'V = \tfrac{1}{3}\pi h (r_1^2 + r_2^2 + r_1 r_2)'),
  // Statistics, probability, money
  Formula('Statistics', 'Mean', r'\bar{x} = \frac{\sum f_i x_i}{\sum f_i}'),
  Formula('Statistics', 'Median (grouped)', r'l + \left(\frac{\frac{n}{2} - cf}{f}\right) h'),
  Formula('Statistics', 'Mode (grouped)', r'l + \left(\frac{f_1 - f_0}{2f_1 - f_0 - f_2}\right) h'),
  Formula('Probability', 'Probability', r'P(E) = \frac{\text{favourable outcomes}}{\text{total outcomes}}'),
  Formula('Probability', 'Complement', r'P(E) + P(\bar{E}) = 1'),
  Formula('Comparing quantities', 'Simple interest', r'SI = \frac{P \times R \times T}{100}'),
  Formula('Comparing quantities', 'Compound interest', r'A = P\left(1 + \frac{R}{100}\right)^n'),
  Formula('Comparing quantities', 'Profit %', r'\text{Profit\%} = \frac{\text{Profit}}{CP} \times 100'),
  Formula('Comparing quantities', 'Discount %', r'\text{Discount\%} = \frac{\text{Discount}}{MP} \times 100'),
];

const physicsFormulas = <Formula>[
  Formula('Motion', 'Speed', r'v = \frac{d}{t}'),
  Formula('Motion', 'Acceleration', r'a = \frac{v - u}{t}'),
  Formula('Motion', 'First equation', r'v = u + at'),
  Formula('Motion', 'Second equation', r's = ut + \tfrac{1}{2}at^2'),
  Formula('Motion', 'Third equation', r'v^2 = u^2 + 2as'),
  Formula('Force & laws of motion', 'Second law', r'F = ma'),
  Formula('Force & laws of motion', 'Momentum', r'p = mv'),
  Formula('Force & laws of motion', 'Impulse', r'F \, \Delta t = \Delta p'),
  Formula('Gravitation', 'Universal law', r'F = G\frac{m_1 m_2}{r^2}'),
  Formula('Gravitation', 'Weight', r'W = mg'),
  Formula('Gravitation', 'g at the surface', r'g = \frac{GM}{R^2}'),
  Formula('Work & energy', 'Work', r'W = F s \cos\theta'),
  Formula('Work & energy', 'Kinetic energy', r'KE = \tfrac{1}{2}mv^2'),
  Formula('Work & energy', 'Potential energy', r'PE = mgh'),
  Formula('Work & energy', 'Power', r'P = \frac{W}{t}'),
  Formula('Pressure & fluids', 'Pressure', r'P = \frac{F}{A}'),
  Formula('Pressure & fluids', 'Liquid pressure', r'P = h\rho g'),
  Formula('Pressure & fluids', 'Density', r'\rho = \frac{m}{V}'),
  Formula('Pressure & fluids', 'Buoyant force', r'F_B = \rho V g'),
  Formula('Sound & waves', 'Wave speed', r'v = f\lambda'),
  Formula('Sound & waves', 'Period', r'T = \frac{1}{f}'),
  Formula('Sound & waves', 'Echo distance', r'd = \frac{v t}{2}'),
  Formula('Light', 'Mirror formula', r'\frac{1}{f} = \frac{1}{v} + \frac{1}{u}'),
  Formula('Light', 'Lens formula', r'\frac{1}{f} = \frac{1}{v} - \frac{1}{u}'),
  Formula('Light', 'Magnification (lens)', r'm = \frac{h_i}{h_o} = \frac{v}{u}'),
  Formula('Light', 'Power of a lens', r'P = \frac{1}{f\,(\text{m})}'),
  Formula('Light', 'Refractive index', r'n = \frac{c}{v}'),
  Formula('Light', "Snell's law", r'n_1 \sin\theta_1 = n_2 \sin\theta_2'),
  Formula('Electricity', "Ohm's law", r'V = IR'),
  Formula('Electricity', 'Charge', r'Q = It'),
  Formula('Electricity', 'Resistivity', r'R = \rho\frac{L}{A}'),
  Formula('Electricity', 'Series', r'R = R_1 + R_2 + R_3'),
  Formula('Electricity', 'Parallel', r'\frac{1}{R} = \frac{1}{R_1} + \frac{1}{R_2} + \frac{1}{R_3}'),
  Formula('Electricity', 'Electric power', r'P = VI = I^2R = \frac{V^2}{R}'),
  Formula('Electricity', 'Heating', r'H = I^2 R t'),
  Formula('Heat', 'Heat capacity', r'Q = mc\Delta T'),
  Formula('Heat', 'Latent heat', r'Q = mL'),
  Formula('Modern physics', 'Mass–energy', r'E = mc^2'),
  Formula('Modern physics', 'Photon energy', r'E = h\nu'),
];

class Constant {
  final String name;
  final String tex;
  const Constant(this.name, this.tex);
}

const physicsConstants = <Constant>[
  Constant('Acceleration due to gravity', r'g = 9.8\ \text{m/s}^2'),
  Constant('Speed of light', r'c = 3 \times 10^{8}\ \text{m/s}'),
  Constant('Speed of sound (air, 20 °C)', r'v \approx 343\ \text{m/s}'),
  Constant('Gravitational constant', r'G = 6.67 \times 10^{-11}\ \text{N m}^2/\text{kg}^2'),
  Constant('Charge of an electron', r'e = 1.6 \times 10^{-19}\ \text{C}'),
  Constant("Planck's constant", r'h = 6.63 \times 10^{-34}\ \text{J s}'),
  Constant('Avogadro number', r'N_A = 6.022 \times 10^{23}\ \text{mol}^{-1}'),
  Constant('Gas constant', r'R = 8.314\ \text{J mol}^{-1}\text{K}^{-1}'),
  Constant('Atmospheric pressure', r'1\ \text{atm} = 1.013 \times 10^{5}\ \text{Pa}'),
  Constant('Kilowatt-hour', r'1\ \text{kWh} = 3.6 \times 10^{6}\ \text{J}'),
  Constant('Density of water', r'\rho = 1000\ \text{kg/m}^3'),
];

// ---------------------------------------------------------- periodic table

enum ElementCategory { alkali, alkaline, transition, postTransition, metalloid, nonmetal, halogen, noble, lanthanide, actinide, unknown }

extension ElementCategoryX on ElementCategory {
  String get label => switch (this) {
        ElementCategory.alkali => 'Alkali metal',
        ElementCategory.alkaline => 'Alkaline earth metal',
        ElementCategory.transition => 'Transition metal',
        ElementCategory.postTransition => 'Post-transition metal',
        ElementCategory.metalloid => 'Metalloid',
        ElementCategory.nonmetal => 'Non-metal',
        ElementCategory.halogen => 'Halogen',
        ElementCategory.noble => 'Noble gas',
        ElementCategory.lanthanide => 'Lanthanide',
        ElementCategory.actinide => 'Actinide',
        ElementCategory.unknown => 'Properties not yet known',
      };
}

class ChemElement {
  final int z;
  final String symbol, name, mass;
  final int group, period;
  final ElementCategory cat;

  /// Row and column in the NCERT-style table (f-block below, rows 9–10).
  int get row => cat == ElementCategory.lanthanide && z != 57 ? 9 : (cat == ElementCategory.actinide && z != 89 ? 10 : period);
  int get col => (cat == ElementCategory.lanthanide && z != 57) ? z - 58 + 4 : ((cat == ElementCategory.actinide && z != 89) ? z - 90 + 4 : group);
  const ChemElement(this.z, this.symbol, this.name, this.mass, this.group, this.period, this.cat);
}

const _a = ElementCategory.alkali, _ae = ElementCategory.alkaline, _t = ElementCategory.transition, _p = ElementCategory.postTransition;
const _m = ElementCategory.metalloid, _n = ElementCategory.nonmetal, _h = ElementCategory.halogen, _g = ElementCategory.noble;
const _la = ElementCategory.lanthanide, _ac = ElementCategory.actinide, _u = ElementCategory.unknown;

const elements = <ChemElement>[
  ChemElement(1, 'H', 'Hydrogen', '1.008', 1, 1, _n),
  ChemElement(2, 'He', 'Helium', '4.003', 18, 1, _g),
  ChemElement(3, 'Li', 'Lithium', '6.94', 1, 2, _a),
  ChemElement(4, 'Be', 'Beryllium', '9.012', 2, 2, _ae),
  ChemElement(5, 'B', 'Boron', '10.81', 13, 2, _m),
  ChemElement(6, 'C', 'Carbon', '12.011', 14, 2, _n),
  ChemElement(7, 'N', 'Nitrogen', '14.007', 15, 2, _n),
  ChemElement(8, 'O', 'Oxygen', '15.999', 16, 2, _n),
  ChemElement(9, 'F', 'Fluorine', '18.998', 17, 2, _h),
  ChemElement(10, 'Ne', 'Neon', '20.180', 18, 2, _g),
  ChemElement(11, 'Na', 'Sodium', '22.990', 1, 3, _a),
  ChemElement(12, 'Mg', 'Magnesium', '24.305', 2, 3, _ae),
  ChemElement(13, 'Al', 'Aluminium', '26.982', 13, 3, _p),
  ChemElement(14, 'Si', 'Silicon', '28.085', 14, 3, _m),
  ChemElement(15, 'P', 'Phosphorus', '30.974', 15, 3, _n),
  ChemElement(16, 'S', 'Sulphur', '32.06', 16, 3, _n),
  ChemElement(17, 'Cl', 'Chlorine', '35.45', 17, 3, _h),
  ChemElement(18, 'Ar', 'Argon', '39.95', 18, 3, _g),
  ChemElement(19, 'K', 'Potassium', '39.098', 1, 4, _a),
  ChemElement(20, 'Ca', 'Calcium', '40.078', 2, 4, _ae),
  ChemElement(21, 'Sc', 'Scandium', '44.956', 3, 4, _t),
  ChemElement(22, 'Ti', 'Titanium', '47.867', 4, 4, _t),
  ChemElement(23, 'V', 'Vanadium', '50.942', 5, 4, _t),
  ChemElement(24, 'Cr', 'Chromium', '51.996', 6, 4, _t),
  ChemElement(25, 'Mn', 'Manganese', '54.938', 7, 4, _t),
  ChemElement(26, 'Fe', 'Iron', '55.845', 8, 4, _t),
  ChemElement(27, 'Co', 'Cobalt', '58.933', 9, 4, _t),
  ChemElement(28, 'Ni', 'Nickel', '58.693', 10, 4, _t),
  ChemElement(29, 'Cu', 'Copper', '63.546', 11, 4, _t),
  ChemElement(30, 'Zn', 'Zinc', '65.38', 12, 4, _t),
  ChemElement(31, 'Ga', 'Gallium', '69.723', 13, 4, _p),
  ChemElement(32, 'Ge', 'Germanium', '72.630', 14, 4, _m),
  ChemElement(33, 'As', 'Arsenic', '74.922', 15, 4, _m),
  ChemElement(34, 'Se', 'Selenium', '78.971', 16, 4, _n),
  ChemElement(35, 'Br', 'Bromine', '79.904', 17, 4, _h),
  ChemElement(36, 'Kr', 'Krypton', '83.798', 18, 4, _g),
  ChemElement(37, 'Rb', 'Rubidium', '85.468', 1, 5, _a),
  ChemElement(38, 'Sr', 'Strontium', '87.62', 2, 5, _ae),
  ChemElement(39, 'Y', 'Yttrium', '88.906', 3, 5, _t),
  ChemElement(40, 'Zr', 'Zirconium', '91.224', 4, 5, _t),
  ChemElement(41, 'Nb', 'Niobium', '92.906', 5, 5, _t),
  ChemElement(42, 'Mo', 'Molybdenum', '95.95', 6, 5, _t),
  ChemElement(43, 'Tc', 'Technetium', '[98]', 7, 5, _t),
  ChemElement(44, 'Ru', 'Ruthenium', '101.07', 8, 5, _t),
  ChemElement(45, 'Rh', 'Rhodium', '102.91', 9, 5, _t),
  ChemElement(46, 'Pd', 'Palladium', '106.42', 10, 5, _t),
  ChemElement(47, 'Ag', 'Silver', '107.87', 11, 5, _t),
  ChemElement(48, 'Cd', 'Cadmium', '112.41', 12, 5, _t),
  ChemElement(49, 'In', 'Indium', '114.82', 13, 5, _p),
  ChemElement(50, 'Sn', 'Tin', '118.71', 14, 5, _p),
  ChemElement(51, 'Sb', 'Antimony', '121.76', 15, 5, _m),
  ChemElement(52, 'Te', 'Tellurium', '127.60', 16, 5, _m),
  ChemElement(53, 'I', 'Iodine', '126.90', 17, 5, _h),
  ChemElement(54, 'Xe', 'Xenon', '131.29', 18, 5, _g),
  ChemElement(55, 'Cs', 'Caesium', '132.91', 1, 6, _a),
  ChemElement(56, 'Ba', 'Barium', '137.33', 2, 6, _ae),
  ChemElement(57, 'La', 'Lanthanum', '138.91', 3, 6, _la),
  ChemElement(58, 'Ce', 'Cerium', '140.12', 3, 6, _la),
  ChemElement(59, 'Pr', 'Praseodymium', '140.91', 3, 6, _la),
  ChemElement(60, 'Nd', 'Neodymium', '144.24', 3, 6, _la),
  ChemElement(61, 'Pm', 'Promethium', '[145]', 3, 6, _la),
  ChemElement(62, 'Sm', 'Samarium', '150.36', 3, 6, _la),
  ChemElement(63, 'Eu', 'Europium', '151.96', 3, 6, _la),
  ChemElement(64, 'Gd', 'Gadolinium', '157.25', 3, 6, _la),
  ChemElement(65, 'Tb', 'Terbium', '158.93', 3, 6, _la),
  ChemElement(66, 'Dy', 'Dysprosium', '162.50', 3, 6, _la),
  ChemElement(67, 'Ho', 'Holmium', '164.93', 3, 6, _la),
  ChemElement(68, 'Er', 'Erbium', '167.26', 3, 6, _la),
  ChemElement(69, 'Tm', 'Thulium', '168.93', 3, 6, _la),
  ChemElement(70, 'Yb', 'Ytterbium', '173.05', 3, 6, _la),
  ChemElement(71, 'Lu', 'Lutetium', '174.97', 3, 6, _la),
  ChemElement(72, 'Hf', 'Hafnium', '178.49', 4, 6, _t),
  ChemElement(73, 'Ta', 'Tantalum', '180.95', 5, 6, _t),
  ChemElement(74, 'W', 'Tungsten', '183.84', 6, 6, _t),
  ChemElement(75, 'Re', 'Rhenium', '186.21', 7, 6, _t),
  ChemElement(76, 'Os', 'Osmium', '190.23', 8, 6, _t),
  ChemElement(77, 'Ir', 'Iridium', '192.22', 9, 6, _t),
  ChemElement(78, 'Pt', 'Platinum', '195.08', 10, 6, _t),
  ChemElement(79, 'Au', 'Gold', '196.97', 11, 6, _t),
  ChemElement(80, 'Hg', 'Mercury', '200.59', 12, 6, _t),
  ChemElement(81, 'Tl', 'Thallium', '204.38', 13, 6, _p),
  ChemElement(82, 'Pb', 'Lead', '207.2', 14, 6, _p),
  ChemElement(83, 'Bi', 'Bismuth', '208.98', 15, 6, _p),
  ChemElement(84, 'Po', 'Polonium', '[209]', 16, 6, _p),
  ChemElement(85, 'At', 'Astatine', '[210]', 17, 6, _h),
  ChemElement(86, 'Rn', 'Radon', '[222]', 18, 6, _g),
  ChemElement(87, 'Fr', 'Francium', '[223]', 1, 7, _a),
  ChemElement(88, 'Ra', 'Radium', '[226]', 2, 7, _ae),
  ChemElement(89, 'Ac', 'Actinium', '[227]', 3, 7, _ac),
  ChemElement(90, 'Th', 'Thorium', '232.04', 3, 7, _ac),
  ChemElement(91, 'Pa', 'Protactinium', '231.04', 3, 7, _ac),
  ChemElement(92, 'U', 'Uranium', '238.03', 3, 7, _ac),
  ChemElement(93, 'Np', 'Neptunium', '[237]', 3, 7, _ac),
  ChemElement(94, 'Pu', 'Plutonium', '[244]', 3, 7, _ac),
  ChemElement(95, 'Am', 'Americium', '[243]', 3, 7, _ac),
  ChemElement(96, 'Cm', 'Curium', '[247]', 3, 7, _ac),
  ChemElement(97, 'Bk', 'Berkelium', '[247]', 3, 7, _ac),
  ChemElement(98, 'Cf', 'Californium', '[251]', 3, 7, _ac),
  ChemElement(99, 'Es', 'Einsteinium', '[252]', 3, 7, _ac),
  ChemElement(100, 'Fm', 'Fermium', '[257]', 3, 7, _ac),
  ChemElement(101, 'Md', 'Mendelevium', '[258]', 3, 7, _ac),
  ChemElement(102, 'No', 'Nobelium', '[259]', 3, 7, _ac),
  ChemElement(103, 'Lr', 'Lawrencium', '[266]', 3, 7, _ac),
  ChemElement(104, 'Rf', 'Rutherfordium', '[267]', 4, 7, _t),
  ChemElement(105, 'Db', 'Dubnium', '[268]', 5, 7, _t),
  ChemElement(106, 'Sg', 'Seaborgium', '[269]', 6, 7, _t),
  ChemElement(107, 'Bh', 'Bohrium', '[270]', 7, 7, _t),
  ChemElement(108, 'Hs', 'Hassium', '[269]', 8, 7, _t),
  ChemElement(109, 'Mt', 'Meitnerium', '[278]', 9, 7, _u),
  ChemElement(110, 'Ds', 'Darmstadtium', '[281]', 10, 7, _u),
  ChemElement(111, 'Rg', 'Roentgenium', '[282]', 11, 7, _u),
  ChemElement(112, 'Cn', 'Copernicium', '[285]', 12, 7, _u),
  ChemElement(113, 'Nh', 'Nihonium', '[286]', 13, 7, _u),
  ChemElement(114, 'Fl', 'Flerovium', '[289]', 14, 7, _u),
  ChemElement(115, 'Mc', 'Moscovium', '[290]', 15, 7, _u),
  ChemElement(116, 'Lv', 'Livermorium', '[293]', 16, 7, _u),
  ChemElement(117, 'Ts', 'Tennessine', '[294]', 17, 7, _u),
  ChemElement(118, 'Og', 'Oganesson', '[294]', 18, 7, _u),
];

class Ion {
  final String name;
  final String tex;
  final int valency;
  const Ion(this.name, this.tex, this.valency);
}

const commonIons = <Ion>[
  Ion('Hydrogen', r'\mathrm{H^{+}}', 1),
  Ion('Sodium', r'\mathrm{Na^{+}}', 1),
  Ion('Potassium', r'\mathrm{K^{+}}', 1),
  Ion('Silver', r'\mathrm{Ag^{+}}', 1),
  Ion('Ammonium', r'\mathrm{NH_4^{+}}', 1),
  Ion('Magnesium', r'\mathrm{Mg^{2+}}', 2),
  Ion('Calcium', r'\mathrm{Ca^{2+}}', 2),
  Ion('Zinc', r'\mathrm{Zn^{2+}}', 2),
  Ion('Iron(II)', r'\mathrm{Fe^{2+}}', 2),
  Ion('Copper(II)', r'\mathrm{Cu^{2+}}', 2),
  Ion('Iron(III)', r'\mathrm{Fe^{3+}}', 3),
  Ion('Aluminium', r'\mathrm{Al^{3+}}', 3),
  Ion('Chloride', r'\mathrm{Cl^{-}}', 1),
  Ion('Bromide', r'\mathrm{Br^{-}}', 1),
  Ion('Iodide', r'\mathrm{I^{-}}', 1),
  Ion('Hydroxide', r'\mathrm{OH^{-}}', 1),
  Ion('Nitrate', r'\mathrm{NO_3^{-}}', 1),
  Ion('Hydrogen carbonate', r'\mathrm{HCO_3^{-}}', 1),
  Ion('Oxide', r'\mathrm{O^{2-}}', 2),
  Ion('Sulphide', r'\mathrm{S^{2-}}', 2),
  Ion('Sulphate', r'\mathrm{SO_4^{2-}}', 2),
  Ion('Carbonate', r'\mathrm{CO_3^{2-}}', 2),
  Ion('Sulphite', r'\mathrm{SO_3^{2-}}', 2),
  Ion('Phosphate', r'\mathrm{PO_4^{3-}}', 3),
];

// ------------------------------------------------------------ key dates

class KeyDate {
  final String when;
  final String what;
  final String region; // india | world | karnataka
  const KeyDate(this.when, this.what, this.region);
}

const keyDates = <KeyDate>[
  KeyDate('c. 2500 BCE', 'Harappan (Indus Valley) cities at their height', 'india'),
  KeyDate('c. 1500 BCE', 'Early Vedic period begins', 'india'),
  KeyDate('6th c. BCE', 'Gautama Buddha and Mahavira teach', 'india'),
  KeyDate('321 BCE', 'Chandragupta Maurya founds the Maurya Empire', 'india'),
  KeyDate('261 BCE', 'Kalinga war; Ashoka turns to Buddhism', 'india'),
  KeyDate('c. 320 CE', 'Gupta Empire begins', 'india'),
  KeyDate('1206', 'Delhi Sultanate founded by Qutb-ud-din Aibak', 'india'),
  KeyDate('1336', 'Vijayanagara Empire founded', 'india'),
  KeyDate('1453', 'Fall of Constantinople', 'world'),
  KeyDate('1492', 'Columbus reaches the Americas', 'world'),
  KeyDate('1498', 'Vasco da Gama reaches Calicut', 'india'),
  KeyDate('1526', 'First Battle of Panipat; Babur founds the Mughal Empire', 'india'),
  KeyDate('1556', 'Second Battle of Panipat; Akbar\'s reign begins', 'india'),
  KeyDate('1600', 'English East India Company chartered', 'india'),
  KeyDate('1757', 'Battle of Plassey', 'india'),
  KeyDate('1764', 'Battle of Buxar', 'india'),
  KeyDate('1789', 'French Revolution begins', 'world'),
  KeyDate('1799', 'Tipu Sultan dies defending Srirangapatna', 'karnataka'),
  KeyDate('1857', 'First War of Independence (Revolt of 1857)', 'india'),
  KeyDate('1885', 'Indian National Congress founded', 'india'),
  KeyDate('1905', 'Partition of Bengal; Swadeshi movement', 'india'),
  KeyDate('1914–1918', 'First World War', 'world'),
  KeyDate('1915', 'Gandhiji returns to India from South Africa', 'india'),
  KeyDate('1917', 'Russian Revolution', 'world'),
  KeyDate('1919', 'Jallianwala Bagh massacre', 'india'),
  KeyDate('1920', 'Non-Cooperation Movement', 'india'),
  KeyDate('1930', 'Dandi March (Salt Satyagraha)', 'india'),
  KeyDate('1939–1945', 'Second World War', 'world'),
  KeyDate('1942', 'Quit India Movement', 'india'),
  KeyDate('1945', 'United Nations founded', 'world'),
  KeyDate('15 Aug 1947', 'India becomes independent', 'india'),
  KeyDate('26 Jan 1950', 'Constitution of India comes into force', 'india'),
  KeyDate('1956', 'States reorganised on linguistic lines', 'india'),
  KeyDate('1973', 'Mysore State renamed Karnataka', 'karnataka'),
];
