/** Library, hostel and mess, canteen, transport, inventory and fixed assets. */
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';

export async function library(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const lib = c.byEmail.library.id;
  const catalogue: [string, string, string][] = [
    ['Principles of Management', 'Harold Koontz and Heinz Weihrich', '658 KOO'], ['Management: Text and Cases', 'V. S. P. Rao', '658 RAO'], ['Marketing Management', 'Philip Kotler', '658.8 KOT'], ['Human Resource Management', 'Gary Dessler', '658.3 DES'], ['Financial Management', 'I. M. Pandey', '658.15 PAN'],
    ['Business Statistics', 'S. P. Gupta', '519.5 GUP'], ['Advanced Accountancy', 'R. L. Gupta and M. Radhaswamy', '657 GUP'], ['Corporate Accounting', 'S. N. Maheshwari', '657.95 MAH'], ['Cost Accounting: Principles and Practice', 'M. N. Arora', '657.42 ARO'], ['Management Accounting', 'S. N. Maheshwari', '658.15 MAH'],
    ['Income Tax Law and Practice', 'V. K. Singhania', '343.054 SIN'], ['Goods and Services Tax Ready Reckoner', 'V. S. Datey', '343.055 DAT'], ['Auditing and Assurance', 'B. N. Tandon', '657.45 TAN'], ['Indian Financial System', 'M. Y. Khan', '332.1 KHA'], ['Business Law', 'N. D. Kapoor', '346.07 KAP'],
    ['Let Us C', 'Yashavant Kanetkar', '005.133 KAN'], ['Data Structures Using C', 'Reema Thareja', '005.73 THA'], ['Database System Concepts', 'Silberschatz, Korth and Sudarshan', '005.74 SIL'], ['Java: The Complete Reference', 'Herbert Schildt', '005.133 SCH'], ['Computer Networks', 'Andrew S. Tanenbaum', '004.6 TAN'],
    ['Software Engineering', 'Roger S. Pressman', '005.1 PRE'], ['Python Crash Course', 'Eric Matthes', '005.133 MAT'], ['Discrete Mathematics and Its Applications', 'Kenneth H. Rosen', '511.1 ROS'], ['Computer System Architecture', 'M. Morris Mano', '004.22 MAN'], ['Web Technologies', 'Uttam K. Roy', '006.7 ROY'],
    ['Airport Operations and Management', 'Norman Ashford', '387.736 ASH'], ['Fundamentals of Air Transport', 'Alexander Wells', '387.7 WEL'], ['Aviation Safety Management', 'Alan Stolzer', '363.12 STO'], ['Air Cargo Management', 'Michael Sales', '387.744 SAL'], ['Customer Service in the Airline Industry', 'Claire Cook', '387.742 COO'],
    ['Business Research Methods', 'Donald R. Cooper', '001.42 COO'], ['Research Methodology', 'C. R. Kothari', '001.42 KOT'], ['Entrepreneurship Development', 'S. S. Khanka', '658.421 KHA'], ['Consumer Behaviour', 'Leon G. Schiffman', '658.834 SCH'], ['Strategic Management', 'Fred R. David', '658.4012 DAV'],
    ['Wings of Fire', 'A. P. J. Abdul Kalam', '920 KAL'], ['The Discovery of India', 'Jawaharlal Nehru', '954 NEH'], ['Malgudi Days', 'R. K. Narayan', '823 NAR'], ['Mookajjiya Kanasugalu', 'K. Shivarama Karanth', 'K891 KAR'], ['Chomana Dudi', 'K. Shivarama Karanth', 'K891 KAR'],
    ['Constitution of India', 'D. D. Basu', '342.54 BAS'], ['Business Communication', 'Meenakshi Raman', '651.7 RAM'], ['Environmental Studies', 'Erach Bharucha', '363.7 BHA'], ['Banking Theory and Practice', 'K. C. Shekhar', '332.1 SHE'], ['Security Analysis and Portfolio Management', 'Punithavathy Pandian', '332.6 PAN'],
  ];
  const books = await k.ins<{ id: string }>('library_books', catalogue.map(([title, author, callNo], i) => ({ title, author, callNo, isbn: `978-81-${7000 + i * 13}-${100 + i}-${i % 10}`, copies: 2 + (i % 4) })));
  const loans: Record<string, unknown>[] = [];
  for (let i = 0; i < 90; i++) {
    const st = c.students[(i * 7) % c.students.length];
    const issued = addDays(c.today, -r.int(2, 55));
    const due = addDays(issued, 14);
    const returned = i % 5 !== 0 && i % 7 !== 3;
    const lateDays = returned ? (i % 6 === 0 ? r.int(1, 8) : 0) : Math.max(0, Math.round((new Date(c.today).getTime() - new Date(due).getTime()) / 86400000));
    loans.push({ bookId: books[(i * 3) % books.length].id, studentId: st.id, issuedAt: at(issued, '11:00'), dueOn: due, returnedAt: returned ? at(addDays(due, lateDays), '15:00') : null, finePaise: lateDays * 200, issuedBy: lib, finePaidAt: returned && lateDays && i % 2 ? at(addDays(due, lateDays), '15:05') : null });
  }
  await k.ins('library_loans', loans, { returning: false });
}

export async function hostelAndCanteen(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const warden = c.byEmail.warden.id;
  const blocks = await k.ins<{ id: string; gender: string }>('hostel_blocks', [{ name: 'Vidyaranya Block (Boys)', gender: 'male' }, { name: 'Sharada Block (Girls)', gender: 'female' }]);
  const rooms: { id: string; blockId: string }[] = [];
  for (const b of blocks) {
    rooms.push(...(await k.ins<{ id: string; blockId: string }>('hostel_rooms', Array.from({ length: 8 }, (_, i) => ({ blockId: b.id, number: `${b.gender === 'male' ? 'V' : 'S'}-${101 + i + (i > 3 ? 96 : 0)}`, floor: i > 3 ? 2 : 1, monthlyFeePaise: rupees(i % 2 ? 6500 : 8000) })))));
  }
  const beds = await k.ins<{ id: string; roomId: string }>('hostel_beds', rooms.flatMap((rm) => ['A', 'B', 'C'].map((label) => ({ roomId: rm.id, label }))));
  const outstation = c.students.filter((s, i) => i % 6 === 2);
  const boys = outstation.filter((s) => !s.female);
  const girls = outstation.filter((s) => s.female);
  const bedsOf = (blockId: string) => beds.filter((b) => rooms.find((x) => x.id === b.roomId)!.blockId === blockId);
  const assign = (list: typeof outstation, blockId: string) => list.slice(0, bedsOf(blockId).length - 4).map((st, i) => ({ st, bed: bedsOf(blockId)[i] }));
  const allot = [...assign(boys, blocks[0].id), ...assign(girls, blocks[1].id)];
  await k.ins('hostel_allotments', allot.map(({ st, bed }) => ({ studentId: st.id, bedId: bed.id, startsOn: '2026-08-01', createdBy: warden })), { returning: false });
  const free = (blockId: string) => bedsOf(blockId).slice(-4);
  await k.ins('hostel_transfers', [{ studentId: allot[0].st.id, fromBedId: allot[0].bed.id, toBedId: free(blocks[0].id)[0].id, reason: 'Requested a room nearer to the study hall', movedOn: '2026-09-04', movedBy: warden }], { returning: false });
  await k.ins('hostel_waitlist', c.students.filter((_, i) => i % 57 === 11).slice(0, 4).map((st, i) => ({ studentId: st.id, blockId: st.female ? blocks[1].id : blocks[0].id, note: 'Home is 40 km from the campus', status: i === 3 ? 'cancelled' : 'waiting', requestedBy: warden })), { returning: false });
  await k.ins('hostel_complaints', allot.slice(2, 7).map(({ st, bed }, i) => ({ studentId: st.id, roomId: bed.roomId, raisedBy: st.userId ?? warden, category: ['maintenance', 'water', 'mess', 'electrical', 'cleanliness'][i], description: ['Ceiling fan makes a noise at night', 'No hot water in the morning', 'Rice served half cooked on Tuesday', 'Socket near the study table is loose', 'Corridor cleaning is skipped on Sundays'][i], status: i < 2 ? 'resolved' : 'open', resolution: i < 2 ? 'Fixed by the maintenance team' : null, resolvedAt: i < 2 ? at(addDays(c.today, -3)) : null })), { returning: false });
  await k.ins('hostel_gate_passes', allot.slice(5, 13).map(({ st }, i) => ({ studentId: st.id, reason: ['Weekend at home', 'Medical appointment', 'Family function', 'Bank work', 'Weekend at home', 'Interview at a company', 'Local guardian visit', 'Exam fee at the bank'][i], destination: ['Mysuru', 'Manipal Hospital, Old Airport Road', 'Tumakuru', 'Yeshwanthpur', 'Hassan', 'Whitefield', 'Jayanagar', 'Peenya'][i], expectedBackAt: at(addDays(c.today, i < 5 ? -(i + 1) : 1), '19:00'), status: i < 5 ? 'returned' : i === 5 ? 'out' : 'approved', outAt: i < 6 ? at(addDays(c.today, -(i + 1)), '16:30') : null, inAt: i < 5 ? at(addDays(c.today, -(i + 1)), '18:40') : null, issuedBy: warden })), { returning: false });
  const nights = Array.from({ length: 10 }, (_, d) => addDays(c.today, -(d + 1)));
  await k.ins('hostel_night_attendance', nights.flatMap((night) => allot.map(({ st }, i) => ({ studentId: st.id, night, status: (i + night.charCodeAt(9)) % 19 === 0 ? 'leave' : (i * 3 + night.charCodeAt(9)) % 41 === 0 ? 'absent' : 'present', markedBy: warden }))), { returning: false });
  await k.ins('hostel_visitors', allot.slice(0, 5).map(({ st }, i) => ({ studentId: st.id, visitorName: `${r.pick(['Venkatesh', 'Sarala', 'Mahadevappa', 'Girija', 'Annapurna'])} ${st.name.split(' ')[1]}`, relation: ['father', 'mother', 'uncle', 'aunt', 'brother'][i], phone: `+9190000${20000 + i}`, idProof: 'Aadhaar (last 4: ' + (1000 + i * 111) + ')', inAt: at(addDays(c.today, -(i + 1)), '16:00'), outAt: at(addDays(c.today, -(i + 1)), '17:15'), loggedBy: warden })), { returning: false });

  // Mess plans, menu and subscriptions.
  const plans = await k.ins<{ id: string }>('mess_plans', [{ name: 'Full board (3 meals)', monthlyFeePaise: rupees(4200), meals: J(['breakfast', 'lunch', 'dinner']), active: true }, { name: 'Lunch and dinner', monthlyFeePaise: rupees(3200), meals: J(['lunch', 'dinner']), active: true }]);
  const dishes: Record<string, string[]> = { breakfast: ['Idli, sambar, chutney', 'Masala dosa, coconut chutney', 'Pongal, vada', 'Upma, kesari bath', 'Poori, bhaji', 'Chow chow bath', 'Set dosa, vada saagu'], lunch: ['Rice, sambar, beans palya, curd', 'Chapati, mixed veg curry, rice, rasam', 'Bisi bele bath, boondi raita', 'Rice, dal tadka, cabbage palya', 'Ragi mudde, soppu saaru, rice', 'Veg pulao, raita, gobi manchurian', 'Curd rice, lemon rice, pickle'], dinner: ['Chapati, paneer butter masala', 'Rice, rasam, aloo fry', 'Dosa, sagu, chutney', 'Chapati, dal fry, rice', 'Veg biryani, raita', 'Rice, sambar, poriyal', 'Pulka, kurma, rice'] };
  await k.ins('mess_menu', Object.entries(dishes).flatMap(([meal, items]) => items.map((it, d) => ({ dayOfWeek: d + 1, meal, items: it }))), { returning: false });
  await k.ins('mess_subscriptions', allot.map(({ st }, i) => ({ studentId: st.id, planId: plans[i % 5 === 0 ? 1 : 0].id, startsOn: '2026-08-01' })), { returning: false });
  await k.ins('canteen_meal_attendance', allot.slice(0, 12).flatMap(({ st }) => ['lunch', 'dinner'].map((meal) => ({ studentId: st.id, mealDate: addDays(c.today, -1), meal, markedBy: warden }))), { returning: false });

  // Canteen: menu, wallets, top-ups and purchases.
  const canteen = c.byEmail.canteen.id;
  await k.ins('canteen_items', [['Filter coffee', 15], ['Masala tea', 12], ['Veg sandwich', 35], ['Samosa (2)', 25], ['Masala dosa', 50], ['Veg meals', 70], ['Curd rice', 40], ['Fresh lime soda', 25], ['Gobi manchurian', 60]].map(([name, price]) => ({ name, pricePaise: rupees(price as number), available: true })), { returning: false });
  const buyers = c.students.filter((_, i) => i % 8 === 1).slice(0, 36);
  await k.ins('canteen_wallets', buyers.map((st, i) => ({ studentId: st.id, balancePaise: rupees(40 + ((i * 37) % 360)) })), { returning: false });
  await k.ins('canteen_topups', buyers.slice(0, 14).map((st, i) => ({ studentId: st.id, amountPaise: rupees(i % 2 ? 500 : 300), provider: 'counter', providerOrderId: `CTN-${9100 + i}`, providerPaymentId: `CASH-${1200 + i}`, status: 'paid', payerUserId: canteen, paidAt: at(addDays(c.today, -(i + 2)), '09:30') })), { returning: false });
  await k.ins('canteen_wallet_txns', buyers.slice(0, 14).flatMap((st, i) => [{ studentId: st.id, deltaPaise: rupees(i % 2 ? 500 : 300), kind: 'topup', createdBy: canteen, idempotencyKey: `seed-top-${i}` }, { studentId: st.id, deltaPaise: -rupees(35 + (i % 4) * 15), kind: 'purchase', items: J([{ name: 'Veg sandwich', qty: 1 }]), createdBy: canteen, idempotencyKey: `seed-buy-${i}` }]), { returning: false });
}

export async function transport(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const mgr = c.byEmail.transport.id;
  const vehicles = await k.ins<{ id: string }>('transport_vehicles', [['KA-01-AB-4412', 'Tata Starbus 40-seater', 40], ['KA-01-AC-7781', 'Ashok Leyland Lynx 52-seater', 52], ['KA-51-AD-1290', 'Eicher Skyline 32-seater', 32], ['KA-05-AE-3365', 'Force Traveller 17-seater', 17]].map(([reg, model, cap], i) => ({ regNo: reg, model, capacity: cap, status: i === 3 ? 'maintenance' : 'active', insuranceExpiresOn: addDays(c.today, i === 2 ? 12 : 140 + i * 20), fitnessExpiresOn: addDays(c.today, 200 - i * 30), pucExpiresOn: addDays(c.today, i === 1 ? 6 : 90 + i * 11) })));
  const drivers = await k.ins<{ id: string; userId: string | null }>('transport_drivers', [
    { userId: c.byEmail.driver1.id, fullName: 'Manjunath Urs', phone: '+919000022001', role: 'driver', licenseNo: 'KA0120180012345', licenseExpiresOn: addDays(c.today, 700), active: true },
    { userId: c.byEmail.driver2.id, fullName: 'Thimmappa Nayak', phone: '+919000022002', role: 'driver', licenseNo: 'KA0220190054321', licenseExpiresOn: addDays(c.today, 25), active: true },
    { fullName: 'Narayanaswamy', phone: '+919000022003', role: 'driver', licenseNo: 'KA0420170099887', licenseExpiresOn: addDays(c.today, 400), active: true },
    { fullName: 'Pushpa', phone: '+919000022004', role: 'attendant', active: true },
  ]);
  const routeDefs: [string, string[]][] = [
    ['Route 1: Yeshwanthpur - Peenya - Campus', ['Yeshwanthpur Circle', 'Mathikere', 'Peenya 2nd Stage', 'Jalahalli Cross', 'Soundarya Nagar Campus']],
    ['Route 2: Majestic - Rajajinagar - Campus', ['Kempegowda Bus Station', 'Rajajinagar Entrance', 'Mahalakshmi Layout', 'Nagasandra Metro', 'Soundarya Nagar Campus']],
    ['Route 3: Tumakuru Road - Campus', ['Dasanapura', 'Nelamangala Toll', 'T. Dasarahalli', 'Sidedahalli', 'Soundarya Nagar Campus']],
    ['Route 4: Malleswaram - Sadashivanagar - Campus', ['Malleswaram 18th Cross', 'Sadashivanagar', 'Hebbal Flyover', 'Kodigehalli', 'Soundarya Nagar Campus']],
  ];
  const routes = await k.ins<{ id: string }>('transport_routes', routeDefs.map(([name], i) => ({ name, vehicleId: vehicles[i].id, driverId: drivers[i % 3].id, monthlyFeePaise: rupees(1800 + i * 250), active: true })));
  const stops: { id: string; routeId: string; seq: number }[] = [];
  for (const [i, [, names]] of routeDefs.entries()) {
    stops.push(...(await k.ins<{ id: string; routeId: string; seq: number }>('transport_stops', names.map((name, seq) => ({ routeId: routes[i].id, name, seq: seq + 1, lat: (13.08 - seq * 0.012 + i * 0.01).toFixed(6), lng: (77.5 + seq * 0.01 - i * 0.008).toFixed(6), pickupTime: `${String(7 + Math.floor((seq * 12) / 60)).padStart(2, '0')}:${String((seq * 12 + 10) % 60).padStart(2, '0')}` })))));
  }
  const riders = c.students.filter((_, i) => i % 5 === 3);
  await k.ins('transport_assignments', riders.map((st, i) => { const ri = i % 4; const rs = stops.filter((s) => s.routeId === routes[ri].id && s.seq < 5); return { studentId: st.id, routeId: routes[ri].id, stopId: rs[i % rs.length].id, startsOn: '2026-08-03' }; }), { returning: false });
  // Trips: the last six days, morning pick-up and evening drop for each route.
  for (let d = 6; d >= 1; d--) {
    const date = addDays(c.today, -d);
    if (c.holidays.has(date)) continue;
    for (const [ri, route] of routes.entries()) {
      for (const dir of ['pickup', 'drop']) {
        const t = await k.one<{ id: string }>('transport_trips', { routeId: route.id, driverUserId: ri % 2 ? c.byEmail.driver2.id : c.byEmail.driver1.id, direction: dir, status: 'completed', startedAt: at(date, dir === 'pickup' ? '07:10' : '16:15'), endedAt: at(date, dir === 'pickup' ? '08:35' : '17:40'), lastStopSeq: 5, lastLat: '13.0412', lastLng: '77.5233', lastSpeedKmh: '0', lastPingAt: at(date, dir === 'pickup' ? '08:35' : '17:40'), pings: r.int(60, 140) });
        await k.ins('transport_trip_events', stops.filter((s) => s.routeId === route.id).map((s) => ({ tripId: t.id, kind: 'arrived', stopId: s.id, at: at(date, dir === 'pickup' ? `0${7 + Math.floor(s.seq / 3)}:${String(15 + s.seq * 5).padStart(2, '0')}` : `16:${String(20 + s.seq * 5).padStart(2, '0')}`) })), { returning: false });
      }
    }
  }
  await k.ins('transport_expenses', vehicles.flatMap((v, i) => [{ vehicleId: v.id, kind: 'fuel', spentOn: addDays(c.today, -3 - i), amountPaise: rupees(5200 + i * 700), litres: (55 + i * 6).toFixed(1), odometerKm: 41200 + i * 5200, note: 'Diesel at Peenya bunk', createdBy: mgr }, { vehicleId: v.id, kind: i % 2 ? 'repair' : 'toll', spentOn: addDays(c.today, -12 - i), amountPaise: rupees(i % 2 ? 8400 : 640), note: i % 2 ? 'Brake pad replacement' : 'FASTag recharge', createdBy: mgr }]), { returning: false });
  await k.ins('transport_incidents', [{ vehicleId: vehicles[1].id, kind: 'delay', severity: 'low', description: 'Route 2 reached the campus 25 minutes late due to a waterlogged underpass at Rajajinagar.', occurredAt: at(addDays(c.today, -9), '08:50'), status: 'resolved', resolution: 'Diverted via Nagasandra; parents informed on the app.', reportedBy: c.byEmail.driver2.id, resolvedAt: at(addDays(c.today, -9), '12:00') }, { vehicleId: vehicles[3].id, kind: 'breakdown', severity: 'medium', description: 'Force Traveller developed a clutch fault on the Hebbal flyover.', occurredAt: at(addDays(c.today, -2), '07:40'), status: 'open', reportedBy: c.byEmail.driver1.id }], { returning: false });
  await k.ins('transport_gps_sources', { name: 'Route 1 bus tracker (demo)', tokenHash: 'demo-token-hash-not-a-real-credential', active: false }, { returning: false });
}

export async function inventory(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const sk = c.byEmail.stores.id;
  const admin = c.byEmail.admin.id;
  const stores = await k.ins<{ id: string }>('inv_stores', [{ name: 'Main Store', location: 'Ground floor, Admin block' }, { name: 'Computer Lab Store', location: 'First floor, Lab block' }]);
  const itemDefs: [string, string, string, string][] = [['STN-001', 'A4 paper ream (75 gsm)', 'Stationery', 'ream'], ['STN-002', 'Whiteboard marker (black)', 'Stationery', 'box'], ['STN-003', 'Register, 200 pages', 'Stationery', 'nos'], ['STN-004', 'Duster', 'Stationery', 'nos'], ['CLN-001', 'Floor cleaner 5 L', 'Housekeeping', 'can'], ['CLN-002', 'Phenyl 5 L', 'Housekeeping', 'can'], ['ELC-001', 'LED tube light 20 W', 'Electrical', 'nos'], ['ELC-002', 'Ceiling fan 1200 mm', 'Electrical', 'nos'], ['CMP-001', 'Keyboard USB', 'IT', 'nos'], ['CMP-002', 'Optical mouse', 'IT', 'nos'], ['CMP-003', 'HDMI cable 5 m', 'IT', 'nos'], ['CMP-004', 'Toner cartridge (HP 12A)', 'IT', 'nos'], ['SPT-001', 'Cricket ball (leather)', 'Sports', 'nos'], ['SPT-002', 'Volleyball', 'Sports', 'nos'], ['FRN-001', 'Student bench (2 seater)', 'Furniture', 'nos']];
  const items = await k.ins<{ id: string }>('inv_items', itemDefs.map(([sku, name, category, unit], i) => ({ sku, name, category, unit, reorderLevel: 5 + (i % 4) * 5, active: true })));
  const vendors = await k.ins<{ id: string }>('inv_vendors', [['Sri Lakshmi Stationers', '29AABFS1234L1Z7', 'orders@srilakshmi-stationers.demo.kinetix.in'], ['Bengaluru Office Solutions', '29AAGCB4421M1ZP', 'sales@bos.demo.kinetix.in'], ['Peenya Electricals', '29AAFPE7788K1Z1', 'peenya.elec@demo.kinetix.in'], ['Kaveri Furniture Works', '29AAHFK9021R1ZB', 'kaveri.furn@demo.kinetix.in']].map(([name, gstin, email], i) => ({ name, gstin, phone: `+9190000${30000 + i}`, email, active: true })));
  // Stock levels and the receipts behind them.
  const stockRows = items.flatMap((it, i) => [{ storeId: i >= 8 && i <= 11 ? stores[1].id : stores[0].id, itemId: it.id, qty: [40, 12, 60, 25, 8, 6, 30, 4, 18, 22, 9, 3, 14, 10, 55][i] }]);
  await k.ins('inv_stock', stockRows, { returning: false });
  await k.ins('inv_stock_moves', stockRows.flatMap((s, i) => [{ storeId: s.storeId, itemId: s.itemId, delta: s.qty + 6, kind: 'grn', refType: 'goods_receipt', note: 'Opening receipt for the semester', createdBy: sk }, { storeId: s.storeId, itemId: s.itemId, delta: -6, kind: 'issue', issuedTo: ['Commerce department', 'Computer lab', 'Office', 'Hostel'][i % 4], note: 'Issued on requisition', createdBy: sk }]), { returning: false });

  // Procurement: requisitions in each state, an RFQ with quotes, orders, receipts and invoices.
  const nums = { REQ: 0, PO: 0, RFQ: 0, TRF: 0, RTN: 0 };
  const num = (kind: keyof typeof nums) => `${kind}-${String(++nums[kind]).padStart(4, '0')}`;
  const reqDefs = [['submitted', 'Lab keyboards and mice for BCA lab', [8, 9], [20, 20]], ['approved', 'Tube lights for Block B corridor', [6], [24]], ['ordered', 'Stationery for IA week', [0, 1, 2], [30, 10, 40]], ['rejected', 'Extra ceiling fans', [7], [10]], ['ordered', 'Benches for new classroom', [14], [20]], ['approved', 'Toner for office printers', [11], [6]]] as const;
  const reqs: { id: string; status: string }[] = [];
  for (const [status, reason, its, qtys] of reqDefs) {
    const rq = await k.one<{ id: string }>('inv_requisitions', { number: num('REQ'), requestedBy: c.byEmail['hod.computers'].id, reason, status, decidedBy: status === 'submitted' ? null : admin, decidedAt: status === 'submitted' ? null : at(addDays(c.today, -10)), decisionNote: status === 'rejected' ? 'Not in the budget this semester' : null });
    await k.ins('inv_requisition_lines', its.map((ix, i) => ({ requisitionId: rq.id, itemId: items[ix].id, qty: qtys[i] })), { returning: false });
    reqs.push({ id: rq.id, status });
  }
  const rfq = await k.one<{ id: string }>('inv_rfqs', { number: num('RFQ'), requisitionId: reqs[1].id, status: 'open', closesOn: addDays(c.today, 5), createdBy: sk });
  for (const [vi, v] of vendors.slice(0, 3).entries()) {
    const q = await k.one<{ id: string }>('inv_quotes', { rfqId: rfq.id, vendorId: v.id, deliveryDays: 4 + vi * 2, note: 'GST extra as applicable', totalPaise: rupees(24 * (210 + vi * 15)) });
    await k.ins('inv_quote_lines', { quoteId: q.id, itemId: items[6].id, unitPricePaise: rupees(210 + vi * 15) }, { returning: false });
  }
  const pos: { id: string; lines: { id: string; qty: number }[]; vendorId: string; total: number }[] = [];
  for (const [i, rq] of [reqs[2], reqs[4]].entries()) {
    const total = rupees(i === 0 ? 13250 : 52000);
    const po = await k.one<{ id: string }>('inv_purchase_orders', { number: num('PO'), requisitionId: rq.id, vendorId: vendors[i === 0 ? 0 : 3].id, storeId: stores[0].id, status: i === 0 ? 'received' : 'partially_received', totalPaise: total, createdBy: sk, departmentId: c.departments['Commerce'] });
    const lines = await k.ins<{ id: string; qty: number }>('inv_po_lines', (i === 0 ? [[0, 30, 300], [1, 10, 480], [2, 40, 90]] : [[14, 20, 2600]]).map(([ix, qty, price]) => ({ poId: po.id, itemId: items[ix].id, qty, unitPricePaise: rupees(price), receivedQty: i === 0 ? qty : 12 })));
    const gr = await k.one<{ id: string }>('inv_goods_receipts', { poId: po.id, receivedBy: sk, note: i === 0 ? 'Complete delivery' : 'First lot of benches', receivedAt: at(addDays(c.today, -6 - i), '12:00') });
    await k.ins('inv_goods_receipt_lines', lines.map((l) => ({ receiptId: gr.id, poLineId: l.id, qty: i === 0 ? l.qty : 12 })), { returning: false });
    pos.push({ id: po.id, lines, vendorId: vendors[i === 0 ? 0 : 3].id, total });
  }
  await k.ins('inv_invoices', [{ poId: pos[0].id, vendorId: pos[0].vendorId, invoiceNo: 'SLS/26-27/0418', amountPaise: pos[0].total, expectedPaise: pos[0].total, status: 'paid', createdBy: c.byEmail.accounts.id }, { poId: pos[1].id, vendorId: pos[1].vendorId, invoiceNo: 'KFW/1127', amountPaise: rupees(33000), expectedPaise: rupees(31200), status: 'mismatch', note: 'Invoice is for 12 benches at 2,750; the order says 2,600.', createdBy: c.byEmail.accounts.id }], { returning: false });
  await k.ins('inv_transfers', [{ number: num('TRF'), fromStoreId: stores[0].id, toStoreId: stores[1].id, itemId: items[10].id, qty: 3, note: 'HDMI cables for the lab projector', createdBy: sk }], { returning: false });
  await k.ins('inv_returns', [{ number: num('RTN'), kind: 'vendor', storeId: stores[0].id, itemId: items[6].id, qty: 4, vendorId: vendors[2].id, reason: 'Four tube lights arrived broken', creditPaise: rupees(840), createdBy: sk }, { number: num('RTN'), kind: 'issue', storeId: stores[0].id, itemId: items[3].id, qty: 2, issuedTo: 'Languages department', reason: 'Extra dusters returned', createdBy: sk }], { returning: false });
  await k.ins('doc_counters', Object.entries(nums).map(([kind, lastNo]) => ({ kind, lastNo })), { returning: false });
  void r;
}

export async function assets(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const sk = c.byEmail.stores.id;
  const defs: [string, string, string, string, string, number, number][] = [
    ['SIMS-IT-001', 'Dell OptiPlex desktops (40 nos), Computer Lab 1', 'IT', 'Computer Lab 1', '2023-07-12', 2400000, 5],
    ['SIMS-IT-002', 'HP LaserJet Pro M404 printer', 'IT', 'Admin office', '2024-01-20', 24500, 5],
    ['SIMS-IT-003', 'Epson EB-X51 projector, Seminar Hall', 'AV', 'Seminar Hall', '2022-08-02', 58000, 6],
    ['SIMS-IT-004', 'Interactive smartboard 86 inch', 'AV', 'Room 104', '2025-06-14', 185000, 7],
    ['SIMS-FUR-001', 'Classroom furniture, Block A', 'Furniture', 'Block A', '2019-06-10', 950000, 12],
    ['SIMS-FUR-002', 'Library racks and reading tables', 'Furniture', 'Library', '2020-01-25', 420000, 12],
    ['SIMS-ELE-001', 'Split AC 2 ton, Principal office', 'Electrical', 'Principal office', '2024-03-05', 62000, 8],
    ['SIMS-ELE-002', 'Generator 62.5 kVA', 'Electrical', 'Generator room', '2021-09-18', 780000, 10],
    ['SIMS-VEH-001', 'Tata Starbus 40-seater (KA-01-AB-4412)', 'Vehicle', 'Transport yard', '2022-05-30', 2850000, 8],
    ['SIMS-AVI-001', 'Aviation simulation lab: flight training device', 'Lab equipment', 'Aviation Simulation Lab', '2025-08-04', 1450000, 7],
    ['SIMS-SPT-001', 'Gym equipment set', 'Sports', 'Sports room', '2023-02-14', 210000, 8],
    ['SIMS-LIB-001', 'RFID library security gate', 'Library', 'Library', '2024-11-11', 175000, 7],
  ];
  const rows = await k.ins<{ id: string; tag: string; costPaise: string; purchasedOn: string; usefulLifeYears: number; salvagePaise: string }>('assets', defs.map(([tag, name, category, location, purchasedOn, cost, life], i) => ({ tag, name, category, location, purchasedOn, costPaise: rupees(cost), salvagePaise: rupees(Math.round(cost * 0.05)), usefulLifeYears: life, method: i === 7 ? 'wdv' : 'slm', wdvRatePct: i === 7 ? '15' : null, status: i === 3 ? 'in_maintenance' : 'active' })));
  const staffIds = [c.byEmail['hod.computers'].id, c.byEmail['hod.commerce'].id, c.byEmail.accounts.id, c.byEmail.library.id];
  await k.ins('asset_allocations', rows.slice(0, 6).map((a, i) => ({ assetId: a.id, assignedTo: ['BCA department', 'Commerce department', 'Seminar Hall', 'Room 104', 'Block A', 'Library'][i], userId: staffIds[i % 4], allocatedOn: a.purchasedOn })), { returning: false });
  await k.ins('asset_maintenance', [{ assetId: rows[0].id, kind: 'service', description: 'Annual maintenance contract visit: OS reinstall on 6 systems', costPaise: rupees(9500), doneOn: '2026-07-20', nextDueOn: '2027-07-20', createdBy: sk }, { assetId: rows[3].id, kind: 'repair', description: 'Touch panel recalibration and cable replacement', costPaise: rupees(4200), doneOn: addDays(c.today, -4), createdBy: sk }, { assetId: rows[7].id, kind: 'service', description: 'Half-yearly generator service and oil change', costPaise: rupees(11800), doneOn: '2026-08-12', nextDueOn: addDays(c.today, 9), createdBy: sk }, { assetId: rows[8].id, kind: 'service', description: 'Bus servicing at 40,000 km', costPaise: rupees(18400), doneOn: '2026-07-28', nextDueOn: '2026-12-28', createdBy: c.byEmail.transport.id }], { returning: false });
  const posts = rows.filter((a) => a.purchasedOn < '2025-04-01').map((a) => {
    const dep = Math.round((Number(a.costPaise) - Number(a.salvagePaise)) / a.usefulLifeYears);
    return { assetId: a.id, kind: 'depreciation', fiscalYear: '2025-26', postedOn: '2026-03-31', voucherNo: `DEP-${a.tag}-2025-26`, narration: `Depreciation 2025-26 on ${a.tag}`, lines: J([{ ledger: 'Depreciation', debitPaise: dep, creditPaise: 0 }, { ledger: 'Accumulated Depreciation', debitPaise: 0, creditPaise: dep }]), postedBy: c.byEmail.accounts.id };
  });
  await k.ins('asset_gl_postings', posts, { returning: false });
}
