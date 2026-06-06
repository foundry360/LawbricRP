import type { GhlCustomField } from "@/lib/api";

export const BUSINESS_INDUSTRY_OPTIONS = [
  "Advertising & Marketing",
  "Aerospace & Defense",
  "Agriculture & Farming",
  "Architecture & Planning",
  "Automotive",
  "Banking",
  "Biotechnology",
  "Cannabis",
  "Chemicals",
  "Construction",
  "Consulting",
  "Consumer Goods",
  "E-commerce",
  "Education",
  "Energy & Utilities",
  "Engineering",
  "Entertainment & Media",
  "Environmental Services",
  "Events & Hospitality",
  "Fashion & Apparel",
  "Financial Services",
  "Food & Beverage",
  "Government & Public Sector",
  "Healthcare",
  "Home Services (HVAC, Plumbing, etc.)",
  "Hospitality (Hotels, Restaurants, Travel)",
  "Human Resources",
  "Import & Export",
  "Industrial & Manufacturing",
  "Information Technology",
  "Insurance",
  "Legal Services",
  "Logistics & Transportation",
  "Manufacturing",
  "Marine",
  "Mining & Metals",
  "Nonprofit / NGO",
  "Oil & Gas",
  "Pharmaceuticals",
  "Professional Services",
  "Real Estate",
  "Renewable Energy",
  "Retail",
  "SaaS / Software",
  "Security Services",
  "Sports & Recreation",
  "Telecommunications",
  "Transportation",
  "Venture Capital & Private Equity",
  "Warehousing & Distribution",
];

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function getBusinessCustomFieldsCollection(response: unknown): GhlCustomField[] {
  const value = response as {
    fields?: GhlCustomField[];
    customFields?: GhlCustomField[];
    data?: GhlCustomField[] | { fields?: GhlCustomField[]; customFields?: GhlCustomField[] };
  };

  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.fields)) return value.fields;
  if (Array.isArray(value?.customFields)) return value.customFields;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.fields)) return value.data.fields;
  if (Array.isArray(value?.data?.customFields)) return value.data.customFields;
  return [];
}

export function findBusinessCustomField(customFields: GhlCustomField[], fieldName: string) {
  const normalizedFieldName = normalize(fieldName);
  return customFields.find((field) => {
    const fieldLabel = normalize(field.name || field.label);
    const fieldKey = normalize(field.fieldKey || field.key);
    return fieldLabel === normalizedFieldName || fieldKey === `business.${normalizedFieldName.replace(/\s+/g, "_")}`;
  });
}

export function getBusinessCustomFieldOptions(field?: GhlCustomField | null) {
  const options = field?.options || field?.picklistOptions || [];
  return options
    .map((option) =>
      typeof option === "string" ? option : option.label || option.value || option.name || "",
    )
    .filter(Boolean);
}

export function getBusinessIndustryOptions(customFields: GhlCustomField[]) {
  const options = getBusinessCustomFieldOptions(findBusinessCustomField(customFields, "industry"));
  return options.length > 0 ? options : BUSINESS_INDUSTRY_OPTIONS;
}

export function getBusinessIndustryLabel(value: unknown, customFields: GhlCustomField[]) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  const industryField = findBusinessCustomField(customFields, "industry");
  const options = industryField?.options || industryField?.picklistOptions || [];
  const matchedOption = options.find((option) => {
    if (typeof option === "string") return normalize(option) === normalize(rawValue);
    return [option.key, option.label, option.value, option.name].some(
      (candidate) => normalize(candidate) === normalize(rawValue),
    );
  });

  if (!matchedOption || typeof matchedOption === "string") return matchedOption || rawValue;
  return matchedOption.label || matchedOption.value || matchedOption.name || rawValue;
}
