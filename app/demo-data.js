// Sample FHIR data for previewing the UI without signing in: open http://localhost:8045/?demo
// Not real patient data.
(() => {
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const loinc = (code, display) => ({ coding: [{ system: "http://loinc.org", code, display }], text: display });
  let id = 0;
  const obs = (cat, code, name, d, value, unit, range, interp) => ({
    resourceType: "Observation", id: "demo-" + ++id, status: "final",
    category: [{ coding: [{ code: cat }], text: cat === "vital-signs" ? "Vital Signs" : "Laboratory" }],
    code: loinc(code, name), effectiveDateTime: day(d),
    valueQuantity: { value, unit },
    ...(range && { referenceRange: [{ low: { value: range[0], unit }, high: { value: range[1], unit } }] }),
    ...(interp && { interpretation: [{ coding: [{ code: interp }] }] }),
  });
  const bp = (d, s, dia) => ({
    resourceType: "Observation", id: "demo-" + ++id, status: "final",
    category: [{ coding: [{ code: "vital-signs" }] }], code: loinc("85354-9", "Blood Pressure"), effectiveDateTime: day(d),
    component: [
      { code: loinc("8480-6", "Systolic"), valueQuantity: { value: s, unit: "mmHg" } },
      { code: loinc("8462-4", "Diastolic"), valueQuantity: { value: dia, unit: "mmHg" } },
    ],
  });
  const dates = [3, 40, 95, 160, 230, 300];
  const vitals = [
    ...dates.map((d, i) => bp(d, [128, 134, 138, 131, 142, 136][i], [82, 85, 88, 84, 90, 86][i])),
    ...dates.map((d, i) => obs("vital-signs", "8867-4", "Pulse", d, [72, 76, 70, 81, 78, 74][i], "/min")),
    ...dates.map((d, i) => obs("vital-signs", "29463-7", "Weight", d, [82.4, 83.1, 84.0, 84.6, 85.2, 85.9][i], "kg")),
    ...dates.map((d, i) => obs("vital-signs", "8310-5", "Temperature", d, [36.8, 37.0, 36.7, 37.2, 36.9, 36.8][i], "Cel")),
    ...dates.map((d, i) => obs("vital-signs", "59408-5", "SpO2", d, [98, 97, 98, 96, 97, 98][i], "%")),
    ...dates.map((d, i) => obs("vital-signs", "9279-1", "Respiratory Rate", d, [16, 15, 17, 16, 18, 16][i], "/min")),
    ...dates.map((d, i) => obs("vital-signs", "39156-5", "BMI", d, [26.9, 27.1, 27.4, 27.6, 27.8, 28.0][i], "kg/m2")),
  ];
  const labDates = [10, 120, 250];
  const lab = (code, name, unit, range, vals, interp = []) => labDates.map((d, i) => obs("laboratory", code, name, d, vals[i], unit, range, interp[i]));
  const labs = [
    ...lab("4548-4", "Hemoglobin A1c", "%", [4, 5.6], [6.4, 6.1, 5.9], ["H", "H", "H"]),
    ...lab("2093-3", "Cholesterol, Total", "mg/dL", [0, 200], [212, 224, 198], ["H", "H"]),
    ...lab("2085-9", "HDL Cholesterol", "mg/dL", [40, 100], [38, 41, 44], ["L"]),
    ...lab("13457-7", "LDL Cholesterol (calc)", "mg/dL", [0, 130], [128, 141, 120], [null, "H"]),
    ...lab("2345-7", "Glucose", "mg/dL", [70, 99], [108, 102, 96], ["H", "H"]),
    ...lab("2160-0", "Creatinine", "mg/dL", [0.7, 1.3], [0.98, 1.01, 0.95]),
    ...lab("718-7", "Hemoglobin", "g/dL", [13.5, 17.5], [14.6, 14.2, 14.9]),
    ...lab("6690-2", "WBC", "10*3/uL", [4.5, 11], [6.8, 7.2, 6.1]),
    ...lab("2823-3", "Potassium", "mmol/L", [3.5, 5.1], [4.2, 4.4, 4.0]),
    ...lab("3016-3", "TSH", "mIU/L", [0.4, 4.0], [2.1, 2.4, 1.9]),
  ];
  const med = (name, sig, status, d, reason, qty, refills) => ({
    resourceType: "MedicationRequest", id: "demo-" + ++id, status, intent: "order",
    medicationReference: { display: name }, authoredOn: day(d).slice(0, 10),
    requester: { display: "Dr. Priya Raman, MD" },
    dosageInstruction: [{ text: sig }], reasonCode: [{ text: reason }],
    dispenseRequest: { quantity: { value: qty, unit: "tablet" }, numberOfRepeatsAllowed: refills },
    courseOfTherapyType: { text: status === "active" ? "Continuous" : "Acute" },
  });
  const meds = [
    med("Metformin 500 mg tablet", "Take 1 tablet by mouth twice daily with meals", "active", 120, "Prediabetes", 60, 5),
    med("Lisinopril 10 mg tablet", "Take 1 tablet by mouth once daily", "active", 250, "Hypertension", 30, 11),
    med("Atorvastatin 20 mg tablet", "Take 1 tablet by mouth at bedtime", "active", 118, "High cholesterol", 30, 11),
    med("Amoxicillin 500 mg capsule", "Take 1 capsule by mouth three times daily for 10 days", "completed", 400, "Sinusitis", 30, 0),
  ];
  const patient = {
    resourceType: "Patient", id: "demo", gender: "female", birthDate: "1984-06-12",
    name: [{ use: "official", given: ["Camila", "Maria"], family: "Lopez" }],
    identifier: [{ type: { text: "MRN" }, value: "E-2049187" }],
    telecom: [{ system: "phone", value: "(555) 012-3456" }, { system: "email", value: "camila.lopez@example.com" }],
    address: [{ use: "home", line: ["123 Sample Street"], city: "Madison", state: "WI", postalCode: "53703" }],
    communication: [{ language: { text: "English" }, preferred: true }],
    maritalStatus: { text: "Married" }, generalPractitioner: [{ display: "Dr. Priya Raman, MD" }],
  };
  const all = [...vitals, ...labs];
  const bundle = (rs) => ({ resourceType: "Bundle", type: "searchset", entry: rs.map((resource) => ({ resource })) });

  window.DEMO_FHIR = async (path) => {
    await new Promise((r) => setTimeout(r, 250));
    if (path.startsWith("Patient/")) return patient;
    if (path.startsWith("Observation/")) return all.find((o) => o.id === path.split("/")[1]);
    if (path.includes("category=vital-signs")) return bundle(vitals);
    if (path.includes("category=laboratory")) return bundle(labs);
    if (path.startsWith("MedicationRequest")) return bundle(meds);
    throw new Error("Not in demo data: " + path);
  };
})();
