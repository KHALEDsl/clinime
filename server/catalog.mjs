// Authoritative catalog snapshot: supplied Clinime service list. Client prices are ignored.
export const CATALOG = [
  {
    "id": "basic",
    "key": "serviceBasicFacial",
    "category": "skin",
    "price": 250,
    "duration": 40,
    "image": "skin",
    "options": [],
    "nameAr": "تنظيف البشرة الأساسي",
    "nameEn": "Basic Facial"
  },
  {
    "id": "deep",
    "key": "serviceDeepFacial",
    "category": "skin",
    "price": 350,
    "duration": 50,
    "image": "skin",
    "options": [],
    "nameAr": "تنظيف البشرة العميق",
    "nameEn": "Deep Cleansing Facial"
  },
  {
    "id": "hydra",
    "key": "serviceHydrafacial",
    "category": "skin",
    "price": 650,
    "duration": 60,
    "image": "skin",
    "options": [
      {
        "id": "basic",
        "key": "optionBasic",
        "price": 650,
        "duration": 60,
        "nameAr": "أساسي",
        "nameEn": "Basic"
      },
      {
        "id": "deluxe",
        "key": "optionDeluxe",
        "price": 850,
        "duration": 75,
        "nameAr": "ديلوكس",
        "nameEn": "Deluxe"
      },
      {
        "id": "premium",
        "key": "optionPremium",
        "price": 1050,
        "duration": 90,
        "nameAr": "بريميوم",
        "nameEn": "Premium"
      }
    ],
    "nameAr": "هيدرافيشل",
    "nameEn": "Hydrafacial"
  },
  {
    "id": "micro",
    "key": "serviceMicroneedling",
    "category": "skin",
    "price": 850,
    "duration": 60,
    "image": "skin",
    "options": [],
    "nameAr": "المايكرونيدلينغ",
    "nameEn": "Microneedling"
  },
  {
    "id": "botox",
    "key": "serviceBotox",
    "category": "injectables",
    "price": 1200,
    "duration": 40,
    "image": "beauty",
    "options": [],
    "nameAr": "حقن البوتوكس",
    "nameEn": "Botox Treatment"
  },
  {
    "id": "filler",
    "key": "serviceFiller",
    "category": "injectables",
    "price": 1600,
    "duration": 45,
    "image": "beauty",
    "options": [
      {
        "id": "1ml",
        "key": "option1ml",
        "price": 1600,
        "duration": 45,
        "nameAr": "1 مل",
        "nameEn": "1 ml"
      },
      {
        "id": "2ml",
        "key": "option2ml",
        "price": 2800,
        "duration": 60,
        "nameAr": "2 مل",
        "nameEn": "2 ml"
      }
    ],
    "nameAr": "حقن الفيلر",
    "nameEn": "Dermal Filler Treatment"
  },
  {
    "id": "laser",
    "key": "serviceLaser",
    "category": "laser",
    "price": 200,
    "duration": 20,
    "image": "laser",
    "options": [
      {
        "id": "underarms",
        "key": "optionUnderarms",
        "price": 200,
        "duration": 20,
        "nameAr": "الإبط",
        "nameEn": "Underarms"
      },
      {
        "id": "legs",
        "key": "optionLegs",
        "price": 450,
        "duration": 40,
        "nameAr": "الساقان",
        "nameEn": "Legs"
      },
      {
        "id": "body",
        "key": "optionFullBody",
        "price": 700,
        "duration": 60,
        "nameAr": "الجسم كاملًا",
        "nameEn": "Full body"
      }
    ],
    "nameAr": "إزالة الشعر بالليزر",
    "nameEn": "Laser Hair Removal"
  },
  {
    "id": "brow",
    "key": "serviceBrowBleaching",
    "category": "cosmetic",
    "price": 120,
    "duration": 20,
    "image": "beauty",
    "options": [],
    "nameAr": "تشقير الحواجب",
    "nameEn": "Brow Bleaching"
  },
  {
    "id": "face",
    "key": "serviceFaceBleaching",
    "category": "cosmetic",
    "price": 180,
    "duration": 25,
    "image": "beauty",
    "options": [],
    "nameAr": "تشقير الوجه",
    "nameEn": "Facial Bleaching"
  },
  {
    "id": "lashes",
    "key": "serviceLashes",
    "category": "cosmetic",
    "price": 300,
    "duration": 45,
    "image": "beauty",
    "options": [],
    "nameAr": "خدمات الرموش",
    "nameEn": "Lash Services"
  },
  {
    "id": "lips",
    "key": "serviceLipBlushing",
    "category": "cosmetic",
    "price": 900,
    "duration": 90,
    "image": "beauty",
    "options": [],
    "nameAr": "توريد الشفاه",
    "nameEn": "Lip Blushing"
  },
  {
    "id": "brightening",
    "key": "serviceBrightening",
    "category": "cosmetic",
    "price": 450,
    "duration": 40,
    "image": "skin",
    "options": [],
    "nameAr": "تفتيح البشرة",
    "nameEn": "Skin Brightening"
  },
  {
    "id": "botox-consult",
    "key": "serviceBotoxConsult",
    "category": "consultations",
    "price": 200,
    "duration": 25,
    "image": "clinic",
    "options": [],
    "nameAr": "استشارة البوتوكس",
    "nameEn": "Botox Consultation"
  },
  {
    "id": "filler-consult",
    "key": "serviceFillerConsult",
    "category": "consultations",
    "price": 200,
    "duration": 25,
    "image": "clinic",
    "options": [],
    "nameAr": "استشارة الفيلر",
    "nameEn": "Dermal Filler Consultation"
  }
];
