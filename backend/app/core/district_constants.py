# backend/app/core/district_constants.py
"""
Canonical Gujarat District Registry & Alias Matrix.

Defines the 33 official Survey of India (SOI) districts as the single authoritative
spatial standard for Gujarat, alongside a comprehensive alias dictionary mapping:
  - Phonetic & historic spellings (e.g. Ahmedabad -> AHMADABAD, Dahod -> DAHOD / DOHAD, Mehsana -> MAHESANA)
  - Police commissionerates & jurisdictions (e.g. Surat City / Surat Rural -> SURAT)
  - Police administrative sub-divisions (e.g. Vav-Tharad / Banaskantha-PLNPR -> BANAS KANTHA)
  - Special police divisions (e.g. Kachchh East Gandhidham -> KACHCHH)
  - Railway police jurisdictions (e.g. WRLY Vadodara, Western Railway Ahmedabad)
"""

from typing import Dict, List, Set

# The 33 authoritative Survey of India (SOI) district names in Gujarat
OFFICIAL_GUJARAT_DISTRICTS: List[str] = [
    "AHMADABAD",
    "AMRELI",
    "ANAND",
    "ARVALLI",
    "BANAS KANTHA",
    "BHARUCH",
    "BHAVNAGAR",
    "BOTAD",
    "CHHOTAUDEPUR",
    "DAHOD",
    "DANGS",
    "DEVBHUMI DWARKA",
    "GANDHINAGAR",
    "GIR SOMNATH",
    "JAMNAGAR",
    "JUNAGADH",
    "KACHCHH",
    "KHEDA",
    "MAHESANA",
    "MAHISAGAR",
    "MORBI",
    "NARMADA",
    "NAVSARI",
    "PANCH MAHALS",
    "PATAN",
    "PORBANDAR",
    "RAJKOT",
    "SABAR KANTHA",
    "SURAT",
    "SURENDRANAGAR",
    "TAPI",
    "VADODARA",
    "VALSAD",
]

# Aliases mapping variant names to canonical official district names.
# All strings are lowercase and stripped of punctuation for matching.
DISTRICT_ALIAS_MAP: Dict[str, str] = {
    # 1. AHMADABAD
    "ahmadabad": "AHMADABAD",
    "ahmedabad": "AHMADABAD",
    "ahmedabad city": "AHMADABAD",
    "ahmedabad rural": "AHMADABAD",
    "ahmadabad city": "AHMADABAD",
    "ahmadabad rural": "AHMADABAD",
    "ahmedabad district": "AHMADABAD",
    "ahmadabad district": "AHMADABAD",
    "wrly ahmedabad": "AHMADABAD",
    "western railway ahmedabad": "AHMADABAD",
    "wstn rly ahmedabad": "AHMADABAD",
    "amdavad": "AHMADABAD",

    # 2. AMRELI
    "amreli": "AMRELI",
    "amreli district": "AMRELI",

    # 3. ANAND
    "anand": "ANAND",
    "anand district": "ANAND",

    # 4. ARVALLI
    "arvalli": "ARVALLI",
    "aravalli": "ARVALLI",
    "modasa": "ARVALLI",
    "arvalli district": "ARVALLI",

    # 5. BANAS KANTHA
    "banas kantha": "BANAS KANTHA",
    "banaskantha": "BANAS KANTHA",
    "banas kanta": "BANAS KANTHA",
    "banaskantha plnpr": "BANAS KANTHA",
    "banaskantha-plnpr": "BANAS KANTHA",
    "palanpur": "BANAS KANTHA",
    "vav tharad": "BANAS KANTHA",
    "vav-tharad": "BANAS KANTHA",
    "vav": "BANAS KANTHA",
    "tharad": "BANAS KANTHA",
    "bk": "BANAS KANTHA",

    # 6. BHARUCH
    "bharuch": "BHARUCH",
    "broach": "BHARUCH",
    "bharuch district": "BHARUCH",

    # 7. BHAVNAGAR
    "bhavnagar": "BHAVNAGAR",
    "bhavanagar": "BHAVNAGAR",
    "bhavnagar city": "BHAVNAGAR",
    "bhavnagar rural": "BHAVNAGAR",
    "bhavnagar district": "BHAVNAGAR",

    # 8. BOTAD
    "botad": "BOTAD",
    "botad district": "BOTAD",

    # 9. CHHOTAUDEPUR
    "chhotaudepur": "CHHOTAUDEPUR",
    "chhota udepur": "CHHOTAUDEPUR",
    "chotaudepur": "CHHOTAUDEPUR",
    "chota udepur": "CHHOTAUDEPUR",
    "chhota udaipur": "CHHOTAUDEPUR",
    "chota udaipur": "CHHOTAUDEPUR",

    # 10. DAHOD
    "dahod": "DAHOD",
    "dohad": "DAHOD",
    "dahod district": "DAHOD",

    # 11. DANGS
    "dangs": "DANGS",
    "dang": "DANGS",
    "the dangs": "DANGS",
    "the dang": "DANGS",
    "ahwa": "DANGS",

    # 12. DEVBHUMI DWARKA
    "devbhumi dwarka": "DEVBHUMI DWARKA",
    "devbhumi dwrka": "DEVBHUMI DWARKA",
    "devbhoomi dwarka": "DEVBHUMI DWARKA",
    "dwarka": "DEVBHUMI DWARKA",
    "khambhalia": "DEVBHUMI DWARKA",

    # 13. GANDHINAGAR
    "gandhinagar": "GANDHINAGAR",
    "gandhinagar city": "GANDHINAGAR",
    "gandhinagar rural": "GANDHINAGAR",
    "gandhinagar district": "GANDHINAGAR",

    # 14. GIR SOMNATH
    "gir somnath": "GIR SOMNATH",
    "girsomnath": "GIR SOMNATH",
    "somnath": "GIR SOMNATH",
    "veraval": "GIR SOMNATH",

    # 15. JAMNAGAR
    "jamnagar": "JAMNAGAR",
    "jamnagar city": "JAMNAGAR",
    "jamnagar rural": "JAMNAGAR",
    "jamnagar district": "JAMNAGAR",

    # 16. JUNAGADH
    "junagadh": "JUNAGADH",
    "junagadh city": "JUNAGADH",
    "junagadh rural": "JUNAGADH",
    "junagadh district": "JUNAGADH",

    # 17. KACHCHH
    "kachchh": "KACHCHH",
    "kutch": "KACHCHH",
    "kutchh": "KACHCHH",
    "kachchh east gandhidham": "KACHCHH",
    "kachchh east, gandhidham": "KACHCHH",
    "kachchh east": "KACHCHH",
    "kachchh west": "KACHCHH",
    "kutch east": "KACHCHH",
    "kutch west": "KACHCHH",
    "gandhidham": "KACHCHH",
    "bhuj": "KACHCHH",

    # 18. KHEDA
    "kheda": "KHEDA",
    "nadiad": "KHEDA",
    "kaira": "KHEDA",
    "kheda district": "KHEDA",

    # 19. MAHESANA
    "mahesana": "MAHESANA",
    "mehsana": "MAHESANA",
    "mahsana": "MAHESANA",
    "mehsana district": "MAHESANA",

    # 20. MAHISAGAR
    "mahisagar": "MAHISAGAR",
    "lunawada": "MAHISAGAR",
    "mahisagar district": "MAHISAGAR",

    # 21. MORBI
    "morbi": "MORBI",
    "morvi": "MORBI",
    "morbi district": "MORBI",

    # 22. NARMADA
    "narmada": "NARMADA",
    "rajpipla": "NARMADA",
    "narmada district": "NARMADA",

    # 23. NAVSARI
    "navsari": "NAVSARI",
    "navsari district": "NAVSARI",

    # 24. PANCH MAHALS
    "panch mahals": "PANCH MAHALS",
    "panchmahal": "PANCH MAHALS",
    "panchmahals": "PANCH MAHALS",
    "panch mahal": "PANCH MAHALS",
    "godhra": "PANCH MAHALS",

    # 25. PATAN
    "patan": "PATAN",
    "patan district": "PATAN",

    # 26. PORBANDAR
    "porbandar": "PORBANDAR",
    "porbandar district": "PORBANDAR",

    # 27. RAJKOT
    "rajkot": "RAJKOT",
    "rajkot city": "RAJKOT",
    "rajkot rural": "RAJKOT",
    "rajkot district": "RAJKOT",

    # 28. SABAR KANTHA
    "sabar kantha": "SABAR KANTHA",
    "sabarkantha": "SABAR KANTHA",
    "sabar kanta": "SABAR KANTHA",
    "himmatnagar": "SABAR KANTHA",
    "himatnagar": "SABAR KANTHA",
    "sk": "SABAR KANTHA",

    # 29. SURAT
    "surat": "SURAT",
    "surat city": "SURAT",
    "surat rural": "SURAT",
    "surat district": "SURAT",

    # 30. SURENDRANAGAR
    "surendranagar": "SURENDRANAGAR",
    "surendra nagar": "SURENDRANAGAR",
    "surendranagar district": "SURENDRANAGAR",

    # 31. TAPI
    "tapi": "TAPI",
    "vyara": "TAPI",
    "tapi district": "TAPI",

    # 32. VADODARA
    "vadodara": "VADODARA",
    "vadodara city": "VADODARA",
    "vadodara rural": "VADODARA",
    "baroda": "VADODARA",
    "baroda city": "VADODARA",
    "baroda rural": "VADODARA",
    "wrly vadodara": "VADODARA",
    "western railway vadodara": "VADODARA",
    "wstn rly vadodara": "VADODARA",

    # 33. VALSAD
    "valsad": "VALSAD",
    "bulsar": "VALSAD",
    "valsad district": "VALSAD",
}

# Substring indicators that denote Railway Police units (jurisdiction traverses multiple districts)
RAILWAY_POLICE_KEYWORDS: Set[str] = {
    "wrly",
    "western railway",
    "wstn rly",
    "railway",
    "grp",
}
