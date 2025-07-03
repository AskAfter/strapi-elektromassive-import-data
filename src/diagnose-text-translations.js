import "../config/config.js";
import "colors";
import axios from "axios";

const axiosInstance = axios.create({
  baseURL: `${process.env.STRAPI_URL}/graphql`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}`,
  },
});

async function getParameterValuesWithTranslations(locale, page = 1, pageSize = 100) {
  const query = `
    query GetParameterValues($locale: I18NLocaleCode!, $pagination: PaginationArg) {
      parameterValues(locale: $locale, pagination: $pagination) {
        data {
          id
          attributes {
            value
            code
            parameter_type {
              data {
                attributes {
                  name
                }
              }
            }
            localizations {
              data {
                id
                attributes {
                  locale
                  value
                }
              }
            }
          }
        }
        meta {
          pagination {
            total
            page
            pageSize
            pageCount
          }
        }
      }
    }
  `;

  const variables = {
    locale,
    pagination: { page, pageSize },
  };

  try {
    const { data } = await axiosInstance.post("", { query, variables });
    return data.data.parameterValues;
  } catch (error) {
    console.error(`Error fetching parameter values:`, error);
    return { data: [], meta: { pagination: { total: 0 } } };
  }
}

function isTextValue(value) {
  // Check if the value contains Cyrillic text (Ukrainian/Russian)
  const cyrillicRegex = /[\u0400-\u04FF]/;
  
  // Exclude pure numbers, codes, dimensions, etc.
  const isNumericOrCode = /^[\d\s\.\,\-\+\(\)xх×XммmкгgWwVvAAИРIPрТtMLлштшт\.]+$/;
  const isBrandOrCode = /^[A-Za-z0-9\-\s]+$/;
  
  return cyrillicRegex.test(value) && !isNumericOrCode.test(value);
}

function analyzeTranslation(ukText, ruText) {
  // If they're the same, it might be okay for technical terms
  if (ukText === ruText) {
    return {
      status: "same",
      message: "Same as Ukrainian",
      severity: "warning"
    };
  }

  // Check if Russian text looks like random data
  if (ruText.length < 2) {
    return {
      status: "suspicious",
      message: "Too short - likely random data",
      severity: "error"
    };
  }

  // Check if it contains only Latin characters (suspicious for Russian)
  if (/^[A-Za-z0-9\-_\s]+$/.test(ruText) && !/[\u0400-\u04FF]/.test(ruText)) {
    return {
      status: "suspicious", 
      message: "Contains only Latin chars - likely random data",
      severity: "error"
    };
  }

  // Check if it looks like a hash or random string
  if (ruText.length > 10 && !/\s/.test(ruText) && /^[a-zA-Z0-9\-_]+$/.test(ruText)) {
    return {
      status: "suspicious",
      message: "Looks like hash/random string",
      severity: "error"
    };
  }

  return {
    status: "ok",
    message: "Looks like proper translation",
    severity: "success"
  };
}

async function findProblematicTranslations() {
  console.log("🔍 Looking for problematic text translations...".blue.bold);
  
  let problematicCases = [];
  let totalChecked = 0;
  let textValues = 0;
  
  // Check first few pages to get a good sample
  for (let page = 1; page <= 10; page++) {
    console.log(`\nChecking page ${page}...`.cyan);
    
    const result = await getParameterValuesWithTranslations("uk", page, 100);
    const values = result.data;
    
    for (const value of values) {
      const ukText = value.attributes.value;
      const parameterType = value.attributes.parameter_type.data.attributes.name;
      
      totalChecked++;
      
      // Only check text-based values (skip numbers, codes, etc.)
      if (!isTextValue(ukText)) {
        continue;
      }
      
      textValues++;
      
      const ruLocalizations = value.attributes.localizations.data.filter(
        loc => loc.attributes.locale === "ru"
      );

      if (ruLocalizations.length === 0) {
        problematicCases.push({
          id: value.id,
          parameterType,
          ukText,
          ruText: null,
          issue: "Missing Russian translation",
          severity: "error"
        });
        continue;
      }

      const ruText = ruLocalizations[0].attributes.value;
      const analysis = analyzeTranslation(ukText, ruText);
      
      if (analysis.severity === "error") {
        problematicCases.push({
          id: value.id,
          parameterType,
          ukText,
          ruText,
          issue: analysis.message,
          severity: analysis.severity
        });
      }
    }
    
    // Break if we've found enough issues to analyze
    if (problematicCases.length >= 50) {
      break;
    }
  }

  console.log(`\n📊 ANALYSIS RESULTS:`.blue.bold);
  console.log(`Total values checked: ${totalChecked}`);
  console.log(`Text values found: ${textValues}`);
  console.log(`Problematic translations: ${problematicCases.length}`);

  if (problematicCases.length > 0) {
    console.log(`\n🚨 PROBLEMATIC CASES (showing first 20):`.red.bold);
    
    problematicCases.slice(0, 20).forEach((case_, index) => {
      console.log(`\n${index + 1}. ID: ${case_.id}`);
      console.log(`   Parameter: "${case_.parameterType}"`);
      console.log(`   Ukrainian: "${case_.ukText}"`);
      console.log(`   Russian: ${case_.ruText ? `"${case_.ruText}"` : "MISSING"}`);
      console.log(`   Issue: ${case_.issue}`.red);
    });

    console.log(`\n💡 RECOMMENDATIONS:`.yellow.bold);
    console.log(`1. Re-run translation sync for these ${problematicCases.length} values`);
    console.log(`2. Check OpenAI API key and rate limits`);
    console.log(`3. Verify translation function error handling`);
    console.log(`4. Consider filtering by specific parameter types that commonly have issues`);
    
    // Group by parameter type to identify patterns
    const issuesByType = {};
    problematicCases.forEach(case_ => {
      if (!issuesByType[case_.parameterType]) {
        issuesByType[case_.parameterType] = 0;
      }
      issuesByType[case_.parameterType]++;
    });
    
    console.log(`\n📈 ISSUES BY PARAMETER TYPE:`);
    Object.entries(issuesByType)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([type, count]) => {
        console.log(`   ${type}: ${count} issues`);
      });
      
  } else {
    console.log(`\n✅ No problematic translations found in the sample!`.green.bold);
  }
}

findProblematicTranslations();
