# backend/app/utils/district_utils.py
"""
District Normalization & Resolution Utility.

Provides robust, multi-alias canonical resolution for all 33 Gujarat districts,
eliminating out-of-district invalidations caused by commissionerates, subdivisions,
railway police units, or phonetic spelling variants.
"""

from __future__ import annotations

import re
import difflib
from typing import Optional, List, Union, Set, Dict
from collections import defaultdict

from app.core.district_constants import (
    OFFICIAL_GUJARAT_DISTRICTS,
    DISTRICT_ALIAS_MAP,
    RAILWAY_POLICE_KEYWORDS,
)

# Reverse index: canonical district name -> set of all known aliases
_CANONICAL_TO_ALIASES: Dict[str, Set[str]] = defaultdict(set)
for alias, canonical in DISTRICT_ALIAS_MAP.items():
    _CANONICAL_TO_ALIASES[canonical].add(alias)
    # Add title-cased and upper-cased versions
    _CANONICAL_TO_ALIASES[canonical].add(alias.title())
    _CANONICAL_TO_ALIASES[canonical].add(alias.upper())
    # Acronym-specific formatting (e.g. WRLY Vadodara, Banaskantha-PLNPR)
    if "wrly" in alias:
        _CANONICAL_TO_ALIASES[canonical].add("WRLY " + alias.replace("wrly", "").strip().title())
        _CANONICAL_TO_ALIASES[canonical].add("WRLY " + alias.replace("wrly", "").strip().upper())
    if "plnpr" in alias:
        _CANONICAL_TO_ALIASES[canonical].add(alias.replace("plnpr", "PLNPR").title())
        _CANONICAL_TO_ALIASES[canonical].add(alias.replace("plnpr", "PLNPR"))


def normalize_district_key(name: Optional[str]) -> str:
    """
    Sanitize district strings into a standardized lookup token:
    lower-cased, whitespace-condensed, with special characters removed.
    """
    if not name:
        return ""
    cleaned = str(name).strip().lower()
    cleaned = re.sub(r"[\-_,/]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def is_railway_police(name: Optional[str]) -> bool:
    """
    Returns True if the district/unit string indicates Railway Police (WRLY / GRP),
    which spans tracks across multiple geographic districts.
    """
    if not name:
        return False
    key = normalize_district_key(name)
    return any(keyword in key for keyword in RAILWAY_POLICE_KEYWORDS)


def get_canonical_district(name: Optional[str]) -> Optional[str]:
    """
    Maps any district string (variant, commissionerate, subdivision, or typo)
    to its authoritative 33-district Survey of India (SOI) name.
    
    Returns None if no reasonable match is found.
    """
    if not name:
        return None

    key = normalize_district_key(name)
    if not key:
        return None

    # 1. Direct match in alias map
    if key in DISTRICT_ALIAS_MAP:
        return DISTRICT_ALIAS_MAP[key]

    # 2. Match after removing generic words ('city', 'rural', 'district')
    stripped_key = re.sub(r"\b(city|rural|district)\b", "", key).strip()
    stripped_key = re.sub(r"\s+", " ", stripped_key).strip()
    if stripped_key in DISTRICT_ALIAS_MAP:
        return DISTRICT_ALIAS_MAP[stripped_key]

    # 3. Substring match against known aliases
    for alias, canonical in DISTRICT_ALIAS_MAP.items():
        if len(alias) >= 4 and (alias in key or key in alias):
            return canonical

    # 4. Fuzzy match against all known aliases
    all_aliases = list(DISTRICT_ALIAS_MAP.keys())
    matches = difflib.get_close_matches(key, all_aliases, n=1, cutoff=0.7)
    if matches:
        return DISTRICT_ALIAS_MAP[matches[0]]

    # 5. Fuzzy match against the 33 official names (lower-cased)
    official_lower = [d.lower() for d in OFFICIAL_GUJARAT_DISTRICTS]
    matches = difflib.get_close_matches(key, official_lower, n=1, cutoff=0.7)
    if matches:
        idx = official_lower.index(matches[0])
        return OFFICIAL_GUJARAT_DISTRICTS[idx]

    return None


def is_same_district(name_a: Optional[str], name_b: Optional[str]) -> bool:
    """
    Determine whether two district names represent the same administrative district,
    accounting for aliases, commissionerates, and phonetic differences.
    """
    if not name_a or not name_b:
        return False

    canon_a = get_canonical_district(name_a)
    canon_b = get_canonical_district(name_b)

    if canon_a and canon_b:
        return canon_a == canon_b

    # Fallback to normalized key comparison
    return normalize_district_key(name_a) == normalize_district_key(name_b)


_SPECIFIC_JURISDICTION_ALIASES: Dict[str, Set[str]] = {
    "ahmedabad city": {"Ahmedabad City", "AHMEDABAD CITY", "ahmedabad city", "Ahmadabad City", "AHMADABAD CITY", "ahmadabad city"},
    "ahmedabad rural": {"Ahmedabad Rural", "AHMEDABAD RURAL", "ahmedabad rural", "Ahmadabad Rural", "AHMADABAD RURAL", "ahmadabad rural"},
    "wrly ahmedabad": {"WRLY Ahmedabad", "WRLY AHMEDABAD", "wrly ahmedabad", "Western Railway Ahmedabad", "WESTERN RAILWAY AHMEDABAD", "western railway ahmedabad", "Wstn Rly Ahmedabad"},
    "surat city": {"Surat City", "SURAT CITY", "surat city"},
    "surat rural": {"Surat Rural", "SURAT RURAL", "surat rural"},
    "vadodara city": {"Vadodara City", "VADODARA CITY", "vadodara city", "Baroda City", "BARODA CITY", "baroda city"},
    "vadodara rural": {"Vadodara Rural", "VADODARA RURAL", "vadodara rural", "Baroda Rural", "BARODA RURAL", "baroda rural"},
    "wrly vadodara": {"WRLY Vadodara", "WRLY VADODARA", "wrly vadodara", "Western Railway Vadodara", "WESTERN RAILWAY VADODARA", "western railway vadodara", "Wstn Rly Vadodara"},
    "rajkot city": {"Rajkot City", "RAJKOT CITY", "rajkot city"},
    "rajkot rural": {"Rajkot Rural", "RAJKOT RURAL", "rajkot rural"},
    "vav tharad": {"Vav Tharad", "VAV THARAD", "vav tharad", "Vav-Tharad", "VAV-THARAD"},
    "kachchh east": {"Kachchh East", "KACHCHH EAST", "kachchh east", "Kachchh East-Gandhidham", "KACHCHH EAST-GANDHIDHAM"},
    "kachchh west": {"Kachchh West", "KACHCHH WEST", "kachchh west", "Kachchh West-Bhuj", "KACHCHH WEST-BHUJ"},
    "kachchh east gandhidham": {"Kachchh East", "KACHCHH EAST", "kachchh east", "Kachchh East-Gandhidham", "KACHCHH EAST-GANDHIDHAM"},
    "kachchh west bhuj": {"Kachchh West", "KACHCHH WEST", "kachchh west", "Kachchh West-Bhuj", "KACHCHH WEST-BHUJ"},
}


def get_district_expansion_list(districts: Union[str, List[str]]) -> List[str]:
    """
    Generates a comprehensive list of SQL filter strings for a given district
    or list of districts.
    - If a specific sub-jurisdiction is requested (e.g. 'Ahmedabad City', 'Surat City',
      'WRLY Ahmedabad', 'Vav Tharad'), it expands only to variations of that specific jurisdiction.
    - If a canonical/general district is requested (e.g. 'Ahmedabad', 'Surat', 'Amreli'),
      it expands to all constituent jurisdictions (City, Rural, Railway, etc.).
    """
    if not districts:
        return []

    input_list = districts if isinstance(districts, list) else [districts]
    expanded: Set[str] = set()

    for item in input_list:
        if not item:
            continue
        cleaned = str(item).strip()
        expanded.add(cleaned)

        key = normalize_district_key(cleaned)

        # 1. Check if the query specifically targets a sub-jurisdiction
        if key in _SPECIFIC_JURISDICTION_ALIASES:
            for variant in _SPECIFIC_JURISDICTION_ALIASES[key]:
                expanded.add(variant)
            continue

        # 2. General/canonical district query -> expand to parent + all registered aliases
        canon = get_canonical_district(cleaned)
        if canon:
            expanded.add(canon)
            for alias in _CANONICAL_TO_ALIASES.get(canon, set()):
                expanded.add(alias)
                expanded.add(alias.title())
                expanded.add(alias.upper())
        else:
            # If unrecognized, still try basic variations
            expanded.add(cleaned.title())
            expanded.add(cleaned.upper())
            expanded.add(cleaned.lower())

    return sorted(expanded)

