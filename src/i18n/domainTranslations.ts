import type { ConditionCategory, DiseaseLibraryEntry, LanguageCode, PlantImageRole } from '../types';

const CROP_MAP: Record<string, Record<LanguageCode, string>> = {
  Tomato: { en: 'Tomato', hi: 'टमाटर (Tomato)', kn: 'ಟೊಮ್ಯಾಟೊ (Tomato)' },
  Potato: { en: 'Potato', hi: 'आलू (Potato)', kn: 'ಆಲೂಗಡ್ಡೆ (Potato)' },
  Maize: { en: 'Maize', hi: 'मक्का (Maize)', kn: 'ಮೆಕ್ಕೆಜೋಳ (Maize)' },
  Rice: { en: 'Rice', hi: 'धान / चावल (Rice)', kn: 'ಭತ್ತ (Rice)' },
  Apple: { en: 'Apple', hi: 'सेब (Apple)', kn: 'ಸೇಬು (Apple)' },
  Grape: { en: 'Grape', hi: 'अंगूर (Grape)', kn: 'ದ್ರಾಕ್ಷಿ (Grape)' },
  Pepper: { en: 'Pepper / Chili', hi: 'मिर्च / शिमला मिर्च (Pepper)', kn: 'ಮೆಣಸಿನಕಾಯಿ (Pepper)' },
  Strawberry: { en: 'Strawberry', hi: 'स्ट्रॉबेरी (Strawberry)', kn: 'ಸ್ಟ್ರಾಬೆರಿ (Strawberry)' },
  Wheat: { en: 'Wheat', hi: 'गेहूं (Wheat)', kn: 'ಗೋಧಿ (Wheat)' },
};

const DISEASE_MAP: Record<string, Record<LanguageCode, string>> = {
  Healthy: { en: 'Healthy', hi: 'स्वस्थ (Healthy)', kn: 'ಆರೋಗ್ಯಕರ (Healthy)' },
  'Early Blight': { en: 'Early Blight', hi: 'अगेती झुलसा (Early Blight)', kn: 'ಅರ್ಲಿ ಬ್ಲೈಟ್ / ಆರಂಭಿಕ ಎಲೆ ಚುಕ್ಕೆ' },
  'Late Blight': { en: 'Late Blight', hi: 'पछेती झुलसा (Late Blight)', kn: 'ಲೇಟ್ ಬ್ಲೈಟ್ / ತೀವ್ರ ಕೊಳೆ ರೋಗ' },
  'Septoria Leaf Spot': { en: 'Septoria Leaf Spot', hi: 'सेप्टोरिया पत्ती धब्बा (Septoria Leaf Spot)', kn: 'ಸೆಪ್ಟೋರಿಯಾ ಎಲೆ ಚುಕ್ಕೆ ರೋಗ' },
  'Yellow Leaf Curl Virus': { en: 'Yellow Leaf Curl Virus', hi: 'पीली पत्ती मरोड़ विषाणु (TYLCV)', kn: 'ಹಳದಿ ಎಲೆ ಸುರುಳಿ ವೈರಸ್ (TYLCV)' },
  'Nutrient Deficiency (Nitrogen/Chlorosis)': {
    en: 'Nutrient Deficiency (Nitrogen/Chlorosis)',
    hi: 'पोषक तत्व की कमी / क्लोरोसिस',
    kn: 'ಪೋಷಕಾಂಶ ಕೊರತೆ (ಸಾರಜನಕ/ಹಳದಿಯಾಗುವಿಕೆ)',
  },
  'Leaf Miner / Pest Damage': {
    en: 'Leaf Miner / Pest Damage',
    hi: 'लीफ माइनर / कीट क्षति',
    kn: 'ಎಲೆ ಕೊರೆಯುವ ಹುಳು / ಕೀಟ ಹಾನಿ',
  },
  'Northern Leaf Blight': { en: 'Northern Leaf Blight', hi: 'उत्तरी पत्ती झुलसा (Northern Leaf Blight)', kn: 'ಉತ್ತರ ಎಲೆ ಬ್ಲೈಟ್ ರೋಗ' },
  'Common Rust': { en: 'Common Rust', hi: 'सामान्य रतुआ (Common Rust)', kn: 'ಸಾಮಾನ್ಯ ತುಕ್ಕು ರೋಗ (Rust)' },
  'Rice Blast': { en: 'Rice Blast', hi: 'धान का झोंका रोग (Rice Blast)', kn: 'ಭತ್ತದ ಬೆಂಕಿ ರೋಗ (Rice Blast)' },
  'Brown Spot': { en: 'Brown Spot', hi: 'भूरा धब्बा रोग (Brown Spot)', kn: 'ಕಂದು ಚುಕ್ಕೆ ರೋಗ (Brown Spot)' },
  'Apple Scab': { en: 'Apple Scab', hi: 'सेब का स्कैब रोग (Apple Scab)', kn: 'ಸೇಬು ಸ್ಕ್ಯಾಬ್ ರೋಗ' },
  'Powdery Mildew': { en: 'Powdery Mildew', hi: 'चूर्णिल आसिता / सफेद चूर्ण (Powdery Mildew)', kn: 'ಬೂದು ರೋಗ (Powdery Mildew)' },
  'Bacterial Spot': { en: 'Bacterial Spot', hi: 'जीवाणु धब्बा (Bacterial Spot)', kn: 'ಬ್ಯಾಕ್ಟೀರಿಯಾ ಚುಕ್ಕೆ ರೋಗ' },
  'Leaf Scorch': { en: 'Leaf Scorch', hi: 'पत्ती झुलसन (Leaf Scorch)', kn: 'ಎಲೆ ಸುಡುವಿಕೆ ರೋಗ' },
  'Leaf Rust': { en: 'Leaf Rust', hi: 'पत्ती रतुआ (Leaf Rust)', kn: 'ಎಲೆ ತುಕ್ಕು ರೋಗ' },
  Unclassified: { en: 'Unclassified', hi: 'अवर्गीकृत', kn: 'ವರ್ಗೀಕರಿಸಲಾಗದ' },
};

const CATEGORY_MAP: Record<ConditionCategory, Record<LanguageCode, string>> = {
  fungal: { en: 'Fungal / Oomycete Infection', hi: 'कवक / फफूंद संक्रमण (Fungal)', kn: 'ಶಿಲೀಂಧ್ರ ಸೋಂಕು (Fungal)' },
  bacterial: { en: 'Bacterial Infection', hi: 'जीवाणु संक्रमण (Bacterial)', kn: 'ಬ್ಯಾಕ್ಟೀರಿಯಾ ಸೋಂಕು (Bacterial)' },
  viral: { en: 'Viral Infection', hi: 'विषाणु संक्रमण (Viral)', kn: 'ವೈರಲ್ ಸೋಂಕು (Viral)' },
  pest: { en: 'Insect / Pest Damage', hi: 'कीट क्षति (Pest)', kn: 'ಕೀಟ ಹಾನಿ (Pest)' },
  nutrient_deficiency: {
    en: 'Non-Infectious / Nutrient Deficiency',
    hi: 'गैर-संक्रामक / पोषक तत्व कमी',
    kn: 'ಪೋಷಕಾಂಶ ಕೊರತೆ (ಸಾಂಕ್ರಾಮಿಕವಲ್ಲದ)',
  },
  healthy: { en: 'Healthy Foliage', hi: 'स्वस्थ पत्तियां', kn: 'ಆರೋಗ್ಯಕರ ಎಲೆಗಳು' },
};

const SEVERITY_MAP: Record<string, Record<LanguageCode, string>> = {
  Healthy: { en: 'Healthy', hi: 'स्वस्थ', kn: 'ಆರೋಗ್ಯಕರ' },
  Low: { en: 'Low Severity', hi: 'कम गंभीरता', kn: 'ಕಡಿಮೆ ತೀವ್ರತೆ' },
  Medium: { en: 'Medium Severity', hi: 'मध्यम गंभीरता', kn: 'ಮಧ್ಯಮ ತೀವ್ರತೆ' },
  High: { en: 'High Severity', hi: 'उच्च गंभीरता', kn: 'ಹೆಚ್ಚಿನ ತೀವ್ರತೆ' },
};

const RISK_MAP: Record<string, Record<LanguageCode, string>> = {
  Low: { en: 'Low Risk', hi: 'कम जोखिम', kn: 'ಕಡಿಮೆ ಅಪಾಯ' },
  Medium: { en: 'Medium Risk', hi: 'मध्यम जोखिम', kn: 'ಮಧ್ಯಮ ಅಪಾಯ' },
  High: { en: 'High Risk', hi: 'उच्च जोखिम', kn: 'ಹೆಚ್ಚಿನ ಅಪಾಯ' },
};

const VERIFICATION_MAP: Record<string, Record<LanguageCode, string>> = {
  pending: { en: 'Pending Review', hi: 'समीक्षा लंबित', kn: 'ಪರಿಶೀಲನೆ ಬಾಕಿ' },
  confirmed: { en: 'Expert Confirmed', hi: 'विशेषज्ञ द्वारा पुष्ट', kn: 'ತಜ್ಞರಿಂದ ದೃಢೀಕೃತ' },
  corrected: { en: 'Expert Corrected', hi: 'विशेषज्ञ द्वारा संशोधित', kn: 'ತಜ್ಞರಿಂದ ತಿದ್ದುಪಡಿ' },
  rejected: { en: 'Rejected', hi: 'अस्वीकृत', kn: 'ತಿರಸ್ಕರಿಸಲಾಗಿದೆ' },
};

export const IMAGE_ROLE_LABELS: Record<PlantImageRole, Record<LanguageCode, string>> = {
  closeup_leaf: { en: 'Close-up of affected leaf', hi: 'प्रभावित पत्ती का क्लोज़-अप', kn: 'ಹಾನಿಗೊಳಗಾದ ಎಲೆಯ ಹತ್ತಿರದ ಚಿತ್ರ' },
  underside_leaf: { en: 'Underside of leaf', hi: 'पत्ती का निचला हिस्सा', kn: 'ಎಲೆಯ ಕೆಳಭಾಗ' },
  multiple_leaves: { en: 'Multiple leaves of same plant', hi: 'एक ही पौधे की कई पत्तियां', kn: 'ಒಂದೇ ಸಸ್ಯದ ಹಲವು ಎಲೆಗಳು' },
  entire_plant: { en: 'Entire plant photo', hi: 'पूरे पौधे की तस्वीर', kn: 'ಇಡೀ ಸಸ್ಯದ ಚಿತ್ರ' },
  surrounding_field: { en: 'Surrounding crop / field', hi: 'आसपास की फसल / खेत', kn: 'ಸುತ್ತಮುತ್ತಲಿನ ಬೆಳೆ / ಹೊಲ' },
};

export const SYMPTOM_CHECKLIST_ITEMS: Array<{
  id: string;
  labels: Record<LanguageCode, string>;
}> = [
  { id: 'yellow_leaves', labels: { en: 'Yellow leaves', hi: 'पीली पत्तियां', kn: 'ಹಳದಿ ಎಲೆಗಳು' } },
  { id: 'brown_black_spots', labels: { en: 'Brown or black spots', hi: 'भूरे या काले धब्बे', kn: 'ಕಂದು ಅಥವಾ ಕಪ್ಪು ಚುಕ್ಕೆಗಳು' } },
  { id: 'white_powder', labels: { en: 'White powder on leaves', hi: 'पत्तियों पर सफेद पाउडर', kn: 'ಎಲೆಗಳ ಮೇಲೆ ಬಿಳಿ ಪುಡಿ' } },
  { id: 'holes_in_leaves', labels: { en: 'Holes in leaves', hi: 'पत्तियों में छेद', kn: 'ಎಲೆಗಳಲ್ಲಿ ರಂಧ್ರಗಳು' } },
  { id: 'leaf_curling', labels: { en: 'Leaf curling', hi: 'पत्तियों का मुड़ना', kn: 'ಎಲೆಗಳು ಸುರುಳಿಯಾಗುವುದು' } },
  { id: 'wilting', labels: { en: 'Wilting / drooping', hi: 'पौधे का मुरझाना', kn: 'ಸಸ್ಯ ಬಾಡುವುದು' } },
  { id: 'dry_edges', labels: { en: 'Dry / scorched edges', hi: 'सूखे या जले हुए किनारे', kn: 'ಒಣಗಿದ ಎಲೆ ಅಂಚುಗಳು' } },
  { id: 'rotten_patches', labels: { en: 'Wet / rotten patches', hi: 'गीले या सड़े हुए धब्बे', kn: 'ತೇವ / ಕೊಳೆತ ಕಲೆಗಳು' } },
  { id: 'stunted_growth', labels: { en: 'Stunted growth', hi: 'रुकी हुई बढ़वार', kn: 'ಕುಂಠಿತ ಬೆಳವಣಿಗೆ' } },
];

// Farmer-friendly multilingual summary overrides preserving exact scientific pathogen details
const CATEGORY_CARE_TEMPLATES: Record<
  ConditionCategory,
  Record<LanguageCode, { cause: string; todo: string; prevent: string }>
> = {
  fungal: {
    en: {
      cause: 'Microscopic fungal or oomycete spores spread via rain splash, damp wind, or leftover infected plant debris.',
      todo: 'Remove heavily spotted lower leaves gently, avoid overhead sprinkling, and ask your local KVK or agricultural officer before using any protectant fungicide.',
      prevent: 'Space rows for airflow, mulch soil below plants, rotate crops every 2–3 years, and remove diseased crop residues after harvest.',
    },
    hi: {
      cause: 'फफूंद (Fungus) के बीजाणु बारिश की छींटों, नमी भरी हवा या खेत में बचे पुराने पौधों के अवशेषों से फैलते हैं।',
      todo: 'बहुत अधिक धब्बेदार निचली पत्तियों को सावधानी से हटाएं, पत्तियों के ऊपर पानी छिड़कने से बचें, और किसी भी दवा के छिड़काव से पहले स्थानीय कृषि विज्ञान केंद्र (KVK) से सलाह लें।',
      prevent: 'पौधों के बीच हवा के लिए उचित दूरी रखें, जड़ों के पास पलवार (Mulch) डालें, फसल चक्र अपनाएं और कटाई के बाद रोगग्रस्त अवशेष साफ करें।',
    },
    kn: {
      cause: 'ಶಿಲೀಂಧ್ರ ಬೀಜಕಗಳು (Fungal spores) ಮಳೆಯ ಸಿಂಪಡಣೆ, ತೇವಾಂಶವುಳ್ಳ ಗಾಳಿ ಅಥವಾ ಹಳೆಯ ಬೆಳೆ ಅವಶೇಷಗಳಿಂದ ಹರಡುತ್ತವೆ.',
      todo: 'ಹೆಚ್ಚು ಕಲೆಗಳಿರುವ ಕೆಳಗಿನ ಎಲೆಗಳನ್ನು ನಿಧಾನವಾಗಿ ತೆಗೆದುಹಾಕಿ, ಎಲೆಗಳ ಮೇಲೆ ನೀರು ಸಿಂಪಡಿಸುವುದನ್ನು ತಪ್ಪಿಸಿ, ಮತ್ತು ಶಿಲೀಂಧ್ರನಾಶಕ ಬಳಸುವ ಮುನ್ನ ಸ್ಥಳೀಯ KVK ಕೃಷಿ ಅಧಿಕಾರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.',
      prevent: 'ಗಾಳಿಯಾಡುವಂತೆ ಸಸ್ಯಗಳ ನಡುವೆ ಅಂತರವಿಡಿ, ಮಣ್ಣಿಗೆ ಮಲ್ಚ್ (ಹೊದಿಕೆ) ಹಾಕಿ, ಬೆಳೆ ಪರಿವರ್ತನೆ ಮಾಡಿ ಮತ್ತು ಹಳೆಯ ರೋಗಪೀಡಿತ ಎಲೆಗಳನ್ನು ಸ್ವಚ್ಛಗೊಳಿಸಿ.',
    },
  },
  bacterial: {
    en: {
      cause: 'Bacteria enter leaves through tiny pores or wounds during warm rainstorms, contaminated seeds, or handling wet plants.',
      todo: 'Do not prune or touch wet foliage; carefully remove severely spotted plants and ask an extension officer before applying approved bactericides.',
      prevent: 'Use certified disease-free seed, sanitize garden tools, water strictly at the root zone, and avoid tomato/pepper monocropping.',
    },
    hi: {
      cause: 'जीवाणु (Bacteria) गर्म बारिश के दौरान, संक्रमित बीज से या गीले पौधों को छूने पर पत्तियों के छोटे छिद्रों से अंदर प्रवेश करते हैं।',
      todo: 'गीली फसल के बीच काम न करें; बहुत खराब पौधों को खेत से अलग करें और अनुमोदित उपचार के लिए स्थानीय कृषि अधिकारी से परामर्श लें।',
      prevent: 'प्रमाणित रोग-मुक्त बीज उपयोग करें, औजारों को साफ रखें, केवल जड़ों में सिंचाई करें और फसल चक्र अपनाएं।',
    },
    kn: {
      cause: 'ಬ್ಯಾಕ್ಟೀರಿಯಾಗಳು ಬಿಸಿ ಮಳೆಯ ಸಮಯದಲ್ಲಿ, ಸೋಂಕಿತ ಬೀಜಗಳಿಂದ ಅಥವಾ ಒದ್ದೆಯಾದ ಸಸ್ಯಗಳನ್ನು ಮುಟ್ಟುವುದರಿಂದ ಎಲೆಗಳ ರಂಧ್ರಗಳ ಮೂಲಕ ಪ್ರವೇಶಿಸುತ್ತವೆ.',
      todo: 'ಒದ್ದೆಯಾದ ಎಲೆಗಳ ನಡುವೆ ಕೆಲಸ ಮಾಡಬೇಡಿ; ತೀವ್ರವಾಗಿ ಬಾಧಿತವಾದ ಸಸ್ಯಗಳನ್ನು ಪ್ರತ್ಯೇಕಿಸಿ ಮತ್ತು ಅನುಮೋದಿತ ಚಿಕಿತ್ಸೆಗಾಗಿ ಕೃಷಿ ಅಧಿಕಾರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.',
      prevent: 'ಪ್ರಮಾಣೀಕೃತ ಆರೋಗ್ಯಕರ ಬೀಜಗಳನ್ನು ಬಳಸಿ, ಉಪಕರಣಗಳನ್ನು ಸ್ವಚ್ಛಗೊಳಿಸಿ, ಬೇರಿಗೆ ಮಾತ್ರ ನೀರು ಕೊಡಿ ಮತ್ತು ಬೆಳೆ ಪರಿವರ್ತನೆ ಮಾಡಿ.',
    },
  },
  viral: {
    en: {
      cause: 'Plant viruses are carried inside sap by tiny insect vectors such as whiteflies, aphids, or thrips. Sprays cannot cure a virus already inside a plant.',
      todo: 'Uproot and bury early severely curled plants so insects do not spread the virus further. Monitor undersides for whiteflies and consult KVK for safe vector management.',
      prevent: 'Raise seedlings under 40-mesh insect-proof nets, clear nearby weed hosts, and choose virus-tolerant crop varieties.',
    },
    hi: {
      cause: 'विषाणु (Virus) सफेद मक्खी (Whitefly) या माहू जैसे छोटे रस चूसक कीटों द्वारा फैलते हैं। पौधे में एक बार वायरस आने के बाद कोई स्प्रे इसे ठीक नहीं कर सकता।',
      todo: 'शुरुआती गंभीर रूप से मुड़े पौधों को उखाड़कर नष्ट करें ताकि कीट अन्य स्वस्थ पौधों तक वायरस न फैलाएं। सफेद मक्खी नियंत्रण के लिए KVK से सलाह लें।',
      prevent: 'नर्सरी में कीट-रोधी जाली (40-मेष नेट) लगाएं, खेत के किनारे खरपतवार हटाएं और वायरस-सहिष्णु किस्में लगाएं।',
    },
    kn: {
      cause: 'ವೈರಸ್‌ಗಳು ಬಿಳಿ ನೊಣ (Whitefly) ಅಥವಾ ಹೇನುಗಳಂತಹ ರಸ ಹೀರುವ ಕೀಟಗಳಿಂದ ಹರಡುತ್ತವೆ. ಸಸ್ಯದೊಳಗೆ ವೈರಸ್ ಸೇರಿದ ನಂತರ ಯಾವುದೇ ಸಿಂಪಡಣೆಯಿಂದ ಗುಣಪಡಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ.',
      todo: 'ರೋಗ ಪೀಡಿತ ಸಸಿಗಳನ್ನು ಬೇಗನೆ ಕಿತ್ತು ನಾಶಪಡಿಸಿ ಕೀಟಗಳು ಇತರ ಸಸ್ಯಗಳಿಗೆ ಹರಡದಂತೆ ತಡೆಯಿರಿ. ಬಿಳಿ ನೊಣ ನಿಯಂತ್ರಣಕ್ಕೆ KVK ತಜ್ಞರ ಸಲಹೆ ಪಡೆಯಿರಿ.',
      prevent: 'ಸಸಿಮಡಿಗಳಿಗೆ ಕೀಟ-ನಿರೋಧಕ ಬಲೆ (40-mesh net) ಬಳಸಿ, ಕಳೆಗಳನ್ನು ತೆಗೆಯಿರಿ ಮತ್ತು ವೈರಸ್ ನಿರೋಧಕ ತಳಿಗಳನ್ನು ಬೆಳೆಯಿರಿ.',
    },
  },
  pest: {
    en: {
      cause: 'Chewing caterpillars, beetles, or leaf-miner larvae create physical tunnels or holes across leaf tissue.',
      todo: 'Check leaf undersides for caterpillars or eggs, hand-remove damaged leaves in small plots, install yellow sticky traps, and consult local IPM advisors before spraying.',
      prevent: 'Clear field-edge weeds, avoid excess nitrogen fertilizer, and encourage beneficial natural predators.',
    },
    hi: {
      cause: 'सुंडी, इल्ली या लीफ-माइनर कीट पत्तियों को खाकर छेद या सफेद टेढ़ी-मेढ़ी सुरंगें बना देते हैं।',
      todo: 'पत्तियों के नीचे कीटों या अंडों की जांच करें, छोटे खेत में खराब पत्तियां हटाएं, पीले चिपचिपे ट्रैप लगाएं और छिड़काव से पहले KVK की सलाह लें।',
      prevent: 'मेड़ों से खरपतवार साफ रखें, अत्यधिक यूरिया से बचें और मित्र कीटों को बढ़ावा दें।',
    },
    kn: {
      cause: 'ಎಲೆ ತಿನ್ನುವ ಹುಳುಗಳು ಅಥವಾ ಎಲೆ ಸುರಂಗ ಕೀಟಗಳು ಎಲೆಗಳಲ್ಲಿ ರಂಧ್ರಗಳು ಅಥವಾ ಬಿಳಿ ಗೆರೆಗಳನ್ನು ಉಂಟುಮಾಡುತ್ತವೆ.',
      todo: 'ಎಲೆಗಳ ಕೆಳಭಾಗದಲ್ಲಿ ಹುಳು ಅಥವಾ ಮೊಟ್ಟೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ, ಹಾನಿಗೊಳಗಾದ ಎಲೆಗಳನ್ನು ತೆಗೆಯಿರಿ, ಹಳದಿ ಅಂಟು ಬಲೆಗಳನ್ನು (Sticky traps) ಬಳಸಿ ಮತ್ತು KVK ಸಲಹೆ ಪಡೆಯಿರಿ.',
      prevent: 'ಹೊಲದ ಬದಿಯ ಕಳೆಗಳನ್ನು ಸ್ವಚ್ಛಗೊಳಿಸಿ, ಹೆಚ್ಚುವರಿ ಯೂರಿಯಾ ಬಳಕೆ ತಪ್ಪಿಸಿ ಮತ್ತು ಮಿತ್ರ ಕೀಟಗಳನ್ನು ರಕ್ಷಿಸಿ.',
    },
  },
  nutrient_deficiency: {
    en: {
      cause: 'Non-infectious abiotic stress caused by low soil nutrients (Nitrogen, Magnesium, Potassium), leached topsoil, root compaction, or out-of-range soil pH.',
      todo: 'Do not apply fungicides for nutrient yellowing. Check soil drainage, test soil pH/fertility if possible, and apply compost or KVK-recommended nutrient top-dressing.',
      prevent: 'Use well-rotted farmyard manure or compost before sowing, split fertilizer doses, and test soil health regularly.',
    },
    hi: {
      cause: 'यह कोई संक्रामक रोग नहीं है, बल्कि मिट्टी में पोषक तत्वों (नाइट्रोजन, मैग्नीशियम, पोटाश) की कमी, जलभराव या असंतुलित मिट्टी pH के कारण होता है।',
      todo: 'इसके लिए फफूंदनाशी न छिड़कें। खेत की जल निकासी जांचें, संभव हो तो मिट्टी परीक्षण कराएं और गोबर खाद या KVK द्वारा सुझाए पोषक तत्व दें।',
      prevent: 'बुवाई से पहले सड़ी हुई गोबर खाद/कम्पोस्ट मिलाएं, उर्वरक को किस्तों में दें और नियमित मृदा स्वास्थ्य जांच कराएं।',
    },
    kn: {
      cause: 'ಇದು ಸಾಂಕ್ರಾಮಿಕ ರೋಗವಲ್ಲ; ಮಣ್ಣಿನಲ್ಲಿ ಪೋಷಕಾಂಶಗಳ (ಸಾರಜನಕ, ಮೆಗ್ನೀಸಿಯಮ್, ಪೊಟ್ಯಾಶ್) ಕೊರತೆ, ನೀರು ನಿಲ್ಲುವಿಕೆ ಅಥವಾ ಮಣ್ಣಿನ pH ಅಸಮತೋಲನದಿಂದ ಉಂಟಾಗುತ್ತದೆ.',
      todo: 'ಇದಕ್ಕೆ ಶಿಲೀಂಧ್ರನಾಶಕ ಸಿಂಪಡಿಸಬೇಡಿ. ಮಣ್ಣಿನ ನೀರು ಬಸಿದುಹೋಗುವಿಕೆ ಪರಿಶೀಲಿಸಿ, ಮಣ್ಣು ಪರೀಕ್ಷೆ ಮಾಡಿಸಿ ಮತ್ತು ಕಾಂಪೋಸ್ಟ್ ಅಥವಾ KVK ಸೂಚಿಸಿದ ಪೋಷಕಾಂಶಗಳನ್ನು ನೀಡಿ.',
      prevent: 'ಬಿತ್ತನೆಗೆ ಮುನ್ನ ಚೆನ್ನಾಗಿ ಕೊಳೆತ ಕೊಟ್ಟಿಗೆ ಗೊಬ್ಬರ ಹಾಕಿ, ಗೊಬ್ಬರವನ್ನು ಹಂತ ಹಂತವಾಗಿ ನೀಡಿ ಮತ್ತು ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಪರೀಕ್ಷಿಸಿ.',
    },
  },
  healthy: {
    en: {
      cause: 'Balanced soil moisture, good airflow, and absence of visible foliar spots or pest injury.',
      todo: 'No treatment required. Continue normal root-zone watering and balanced nutrition.',
      prevent: 'Scout lower leaves once a week, especially after rain or high-humidity nights.',
    },
    hi: {
      cause: 'संतुलित नमी, अच्छी हवा और पत्तियों पर किसी रोग या कीट के लक्षण नहीं होने से पौधा स्वस्थ है।',
      todo: 'किसी उपचार की आवश्यकता नहीं है। सामान्य सिंचाई और देखभाल जारी रखें।',
      prevent: 'सप्ताह में एक बार निचली पत्तियों की जांच करते रहें, खासकर बारिश के बाद।',
    },
    kn: {
      cause: 'ಸಮತೋಲಿತ ಮಣ್ಣಿನ ತೇವಾಂಶ, ಉತ್ತಮ ಗಾಳಿಯಾಡುವಿಕೆ ಮತ್ತು ಎಲೆಗಳ ಮೇಲೆ ಯಾವುದೇ ಕಲೆಗಳಿಲ್ಲದಿರುವುದು ಆರೋಗ್ಯದ ಸಂಕೇತವಾಗಿದೆ.',
      todo: 'ಯಾವುದೇ ಚಿಕಿತ್ಸೆ ಅಗತ್ಯವಿಲ್ಲ. ಸಾಮಾನ್ಯ ನೀರಾವರಿ ಮತ್ತು ಬೆಳೆ ಆರೈಕೆಯನ್ನು ಮುಂದುವರಿಸಿ.',
      prevent: 'ವಿಶೇಷವಾಗಿ ಮಳೆಯ ನಂತರ ವಾರಕ್ಕೊಮ್ಮೆ ಕೆಳಗಿನ ಎಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿರಿ.',
    },
  },
};

export function translateCrop(crop: string, lang: LanguageCode): string {
  return CROP_MAP[crop]?.[lang] || crop;
}

export function translateDisease(disease: string, lang: LanguageCode): string {
  return DISEASE_MAP[disease]?.[lang] || disease;
}

export function translateCategory(cat: ConditionCategory | undefined, lang: LanguageCode): string {
  if (!cat) return CATEGORY_MAP.fungal[lang];
  return CATEGORY_MAP[cat]?.[lang] || CATEGORY_MAP.fungal[lang];
}

export function translateSeverity(severity: string, lang: LanguageCode): string {
  return SEVERITY_MAP[severity]?.[lang] || severity;
}

export function translateRisk(riskLevel: string, lang: LanguageCode): string {
  return RISK_MAP[riskLevel]?.[lang] || `${riskLevel} Risk`;
}

export function translateVerification(status: string, lang: LanguageCode): string {
  return VERIFICATION_MAP[status]?.[lang] || status;
}

export function getLocalizedGuidance(
  entry: DiseaseLibraryEntry | null,
  crop: string,
  disease: string,
  category: ConditionCategory,
  lang: LanguageCode
): {
  summary: string;
  causes: string;
  favorableConditions: string;
  todo: string;
  prevent: string;
  pathogen: string;
  referenceSource: string;
  referenceUrl: string;
} {
  if (lang === 'en' && entry) {
    return {
      summary: entry.simple_summary || entry.symptoms,
      causes: entry.causes,
      favorableConditions: entry.favorable_conditions,
      todo: entry.management,
      prevent: entry.prevention,
      pathogen: entry.pathogen,
      referenceSource: entry.reference_source,
      referenceUrl: entry.reference_url,
    };
  }

  const tpl = CATEGORY_CARE_TEMPLATES[category] || CATEGORY_CARE_TEMPLATES.fungal;
  const localized = tpl[lang];
  const trCrop = translateCrop(crop, lang);
  const trDisease = translateDisease(disease, lang);

  const summary =
    lang === 'hi'
      ? `${trCrop} में ${trDisease} के दृश्य लक्षण पहचाने गए हैं।${entry?.pathogen ? ` संभावित कारक: ${entry.pathogen}।` : ''}`
      : lang === 'kn'
      ? `${trCrop} ಬೆಳೆಯಲ್ಲಿ ${trDisease} ಲಕ್ಷಣಗಳು ಕಂಡುಬಂದಿವೆ.${entry?.pathogen ? ` ಸಂಭವನೀಯ ಕಾರಣ: ${entry.pathogen}.` : ''}`
      : `Visual indicators match ${crop} — ${disease}.`;

  return {
    summary,
    causes: localized.cause,
    favorableConditions: entry?.favorable_conditions || '',
    todo: localized.todo,
    prevent: localized.prevent,
    pathogen: entry?.pathogen || '',
    referenceSource: entry?.reference_source || 'ICAR / TNAU / FAO / USDA Reference',
    referenceUrl: entry?.reference_url || 'https://agritech.tnau.ac.in/',
  };
}

export function translateSoilObservation(text: string, lang: LanguageCode): string {
  if (!text || lang === 'en') return text;
  const pairs: Array<[string, { hi: string; kn: string }]> = [
    ['Dark brown / organic-rich appearance', { hi: 'गहरा भूरा / जैविक खाद युक्त दिखने वाली मिट्टी', kn: 'ಗಾಢ ಕಂದು / ಸಾವಯವ ಸಮೃದ್ಧವಾಗಿ ಕಾಣುವ ಮಣ್ಣು' }],
    ['Reddish-brown / iron-rich (laterite-like) tone', { hi: 'लाल-भूरा / लौह युक्त (लैटेराइट जैसी) मिट्टी', kn: 'ಕೆಂಪು-ಕಂದು / ಕಬ್ಬಿಣಾಂಶದ ಮಣ್ಣಿನ ಬಣ್ಣ' }],
    ['Pale tan / sandy or dry clay appearance', { hi: 'हल्का पीला-भूरा / रेतीली या सूखी मिट्टी जैसा रूप', kn: 'ತಿಳಿ ಕಂದು / ಮರಳು ಅಥವಾ ಒಣ ಮಣ್ಣಿನಂತೆ ಕಾಣುತ್ತದೆ' }],
    ['Medium brown soil', { hi: 'मध्यम भूरी मिट्टी', kn: 'ಮಧ್ಯಮ ಕಂದು ಮಣ್ಣು' }],
    ['Appears dark / visibly moist on surface', { hi: 'सतह पर गहरी और नम दिखाई दे रही है', kn: 'ಮೇಲ್ಮೈಯಲ್ಲಿ ತೇವಾಂಶದಿಂದ ಕೂಡಿದಂತೆ ಕಾಣುತ್ತದೆ' }],
    ['Appears light / dry on surface', { hi: 'सतह पर हल्की और सूखी दिखाई दे रही है', kn: 'ಮೇಲ್ಮೈಯಲ್ಲಿ ಒಣಗಿದಂತೆ ಕಾಣುತ್ತದೆ' }],
    ['Moderate surface moisture appearance', { hi: 'सतह पर मध्यम नमी दिखाई दे रही है', kn: 'ಮೇಲ್ಮೈಯಲ್ಲಿ ಮಧ್ಯಮ ತೇವಾಂಶ ಕಾಣುತ್ತದೆ' }],
    ['Fine / relatively smooth compacted surface', { hi: 'महीन / समतल सख्त सतह', kn: 'ನಯವಾದ / ಸಮತಟ್ಟಾದ ಮೇಲ್ಮೈ' }],
    ['Coarse, cloddy, or cracked surface texture', { hi: 'खुरदरी, ढेलेदार या दरार वाली सतह', kn: 'ಒರಟಾದ, ಹೆಂಟೆ ಅಥವಾ ಬಿರುಕು ಬಿಟ್ಟ ಮೇಲ್ಮೈ' }],
    ['Crumbly medium soil texture', { hi: 'भुरभुरी मध्यम बनावट', kn: 'ಸಾಮಾನ್ಯ ಪುಡಿಮಣ್ಣಿನ ರಚನೆ' }],
    ['No prominent white fungal film or salt crust detected on soil surface.', { hi: 'मिट्टी की सतह पर कोई स्पष्ट सफेद फफूंद परत या नमक की पपड़ी नहीं दिखी।', kn: 'ಮಣ್ಣಿನ ಮೇಲ್ಮೈಯಲ್ಲಿ ಯಾವುದೇ ಬಿಳಿ ಶಿಲೀಂಧ್ರ ಪದರ ಅಥವಾ ಉಪ್ಪು ಪದರ ಕಂಡುಬಂದಿಲ್ಲ.' }],
  ];
  for (const [enText, trans] of pairs) {
    if (text === enText) return trans[lang];
  }
  if (text.startsWith('Pale whitish surface patches')) {
    return lang === 'hi'
      ? 'मिट्टी की सतह पर हल्के सफेद धब्बे दिखे — यह नमक की पपड़ी, चूना या सफेद फफूंद हो सकती है; करीब से जांच करें।'
      : 'ಮಣ್ಣಿನ ಮೇಲ್ಮೈಯಲ್ಲಿ ಬಿಳಿ ಮಚ್ಚೆಗಳು ಕಂಡುಬಂದಿವೆ — ಇದು ಉಪ್ಪು ಪದರ ಅಥವಾ ಶಿಲೀಂಧ್ರವಾಗಿರಬಹುದು; ಹತ್ತಿರದಿಂದ ಪರಿಶೀಲಿಸಿ.';
  }
  return text;
}
