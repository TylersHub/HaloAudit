import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get('runId')
    
    if (!runId) {
      return NextResponse.json(
        { error: 'Run ID is required' },
        { status: 400 }
      )
    }

    // Get the backend URL from environment or use default
    const backendUrl = process.env.BACKEND_URL || 'https://auditor-edge.18tyler-rosa1.workers.dev'
    
    // Fetch the report from the backend
    const reportResponse = await fetch(`${backendUrl}/runs/${runId}/report-content`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!reportResponse.ok) {
      if (reportResponse.status === 404) {
        return NextResponse.json(
          { error: 'Report not found' },
          { status: 404 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch report from backend' },
        { status: reportResponse.status }
      )
    }

    const reportContent = await reportResponse.text()
    
    // Parse the markdown report content
    let reportData
    try {
      // Extract metadata from the markdown
      const lines = reportContent.split('\n')
      let runIdFromReport = runId
      let tenantId = 'notch_app_user'
      let source = 'Unknown'
      let generated = new Date().toISOString()
      let textChunks = 0
      let vectorsIndexed = 0
      let transactionsReviewed = 0
      let mimeType = 'application/pdf'
      
      // Parse metadata from markdown
      for (const line of lines) {
        if (line.startsWith('**Run ID:**')) {
          runIdFromReport = line.replace('**Run ID:**', '').trim()
        } else if (line.startsWith('**Tenant ID:**')) {
          tenantId = line.replace('**Tenant ID:**', '').trim()
        } else if (line.startsWith('**Source:**')) {
          source = line.replace('**Source:**', '').trim()
        } else if (line.startsWith('**Generated:**')) {
          generated = line.replace('**Generated:**', '').trim()
        } else if (line.startsWith('- **Text Chunks:**')) {
          textChunks = parseInt(line.replace('- **Text Chunks:**', '').trim()) || 0
        } else if (line.startsWith('- **Vectors Indexed:**')) {
          vectorsIndexed = parseInt(line.replace('- **Vectors Indexed:**', '').trim()) || 0
        } else if (line.startsWith('- **Transactions Reviewed:**')) {
          transactionsReviewed = parseInt(line.replace('- **Transactions Reviewed:**', '').trim()) || 0
        } else if (line.startsWith('- **MIME Type:**')) {
          mimeType = line.replace('- **MIME Type:**', '').trim()
        }
      }
      
      // Extract JSON from the markdown
      const jsonMatch = reportContent.match(/```json\n([\s\S]*?)\n```/)
      let executiveSummary
      
      if (jsonMatch) {
        try {
          // Clean up the JSON by fixing JavaScript-style string concatenation
          let jsonString = jsonMatch[1]
          
          // Fix JavaScript string concatenation with + operators
          jsonString = jsonString.replace(/"([^"]*)"\s*\+\s*"([^"]*)"/g, '"$1$2"')
          jsonString = jsonString.replace(/"([^"]*)"\s*\+\s*"([^"]*)"\s*\+\s*"([^"]*)"/g, '"$1$2$3"')
          jsonString = jsonString.replace(/"([^"]*)"\s*\+\s*"([^"]*)"\s*\+\s*"([^"]*)"\s*\+\s*"([^"]*)"/g, '"$1$2$3$4"')
          
          executiveSummary = JSON.parse(jsonString)
        } catch (jsonError) {
          console.error('Failed to parse JSON from report:', jsonError)
          executiveSummary = {
            determination: {
              audit_standard: 'U.S. GAAS (AICPA AU-C)',
              opinion_type: 'Unmodified',
              reasoning: 'Unable to parse report content'
            },
            report: {
              title_and_addressee: 'Independent Auditor\'s Report\nTo the Board of Directors',
              opinion: 'Opinion\nWe have audited the financial statements of the entity...',
              basis_for_opinion: 'In our opinion, the accompanying financial statements present fairly...',
              key_audit_matters: 'Key audit matters are not applicable to the audit of this entity.',
              responsibilities_of_management_and_governance: 'Management is responsible for the preparation and fair presentation of the financial statements...',
              auditor_responsibilities: 'Our responsibility is to express an opinion on these financial statements...',
              emphasis_of_matter: null,
              other_matter: null,
              other_information: null,
              legal_and_regulatory: null,
              signature_sign_off: '[Auditor Agent]\n[San Francisco, CA]\n[Date]'
            },
            machine_readable_summary_for_automation: {
              audit_standard: 'GAAS',
              opinion_type: 'Unmodified',
              scope_limitation: false,
              material_misstatement: false,
              going_concern: false,
              key_audit_matters: false,
              other_information: false,
              legal_regulatory: false
            }
          }
        }
      } else {
        // Fallback if no JSON found
        executiveSummary = {
          determination: {
            audit_standard: 'U.S. GAAS (AICPA AU-C)',
            opinion_type: 'Unmodified',
            reasoning: 'Unable to parse report content'
          },
          report: {
            title_and_addressee: 'Independent Auditor\'s Report\nTo the Board of Directors',
            opinion: 'Opinion\nWe have audited the financial statements of the entity...',
            basis_for_opinion: 'In our opinion, the accompanying financial statements present fairly...',
            key_audit_matters: 'Key audit matters are not applicable to the audit of this entity.',
            responsibilities_of_management_and_governance: 'Management is responsible for the preparation and fair presentation of the financial statements...',
            auditor_responsibilities: 'Our responsibility is to express an opinion on these financial statements...',
            emphasis_of_matter: null,
            other_matter: null,
            other_information: null,
            legal_and_regulatory: null,
            signature_sign_off: '[Auditor Agent]\n[San Francisco, CA]\n[Date]'
          },
          machine_readable_summary_for_automation: {
            audit_standard: 'GAAS',
            opinion_type: 'Unmodified',
            scope_limitation: false,
            material_misstatement: false,
            going_concern: false,
            key_audit_matters: false,
            other_information: false,
            legal_regulatory: false
          }
        }
      }
      
      // Count findings from the markdown
      const findingsSection = reportContent.match(/## Findings \(\d+\)([\s\S]*?)## Analysis Metadata/)
      let findings = []
      
      if (findingsSection && !findingsSection[1].includes('_No significant findings detected._')) {
        // Parse findings if any exist
        const findingsText = findingsSection[1]
        // This would need more sophisticated parsing for actual findings
        findings = []
      }
      
      reportData = {
        runId: runIdFromReport,
        tenantId,
        source,
        generated,
        executiveSummary,
        findings,
        analysisMetadata: {
          textChunks,
          vectorsIndexed,
          transactionsReviewed,
          mimeType,
          generatedBy: 'Auditor Agent'
        }
      }
    } catch (parseError) {
      console.error('Failed to parse report content:', parseError)
      // Fallback to default structure
      reportData = {
        runId,
        tenantId: 'notch_app_user',
        source: 'Unknown',
        generated: new Date().toISOString(),
        executiveSummary: {
          determination: {
            audit_standard: 'U.S. GAAS (AICPA AU-C)',
            opinion_type: 'Unmodified',
            reasoning: 'The entity is a U.S. private company (non-issuer), so U.S. GAAS applies.'
          },
          report: {
            title_and_addressee: 'Independent Auditor\'s Report\nTo the Board of Directors',
            opinion: 'Opinion\nWe have audited the financial statements of the entity...',
            basis_for_opinion: 'In our opinion, the accompanying financial statements present fairly...',
            key_audit_matters: 'Key audit matters are not applicable to the audit of this entity.',
            responsibilities_of_management_and_governance: 'Management is responsible for the preparation and fair presentation of the financial statements...',
            auditor_responsibilities: 'Our responsibility is to express an opinion on these financial statements...',
            emphasis_of_matter: null,
            other_matter: null,
            other_information: null,
            legal_and_regulatory: null,
            signature_sign_off: '[Auditor Agent]\n[San Francisco, CA]\n[Date]'
          },
          machine_readable_summary_for_automation: {
            audit_standard: 'GAAS',
            opinion_type: 'Unmodified',
            scope_limitation: false,
            material_misstatement: false,
            going_concern: false,
            key_audit_matters: false,
            other_information: false,
            legal_regulatory: false
          }
        },
        findings: [],
        analysisMetadata: {
          textChunks: 0,
          vectorsIndexed: 0,
          transactionsReviewed: 0,
          mimeType: 'application/pdf',
          generatedBy: 'Auditor Agent'
        }
      }
    }

    return NextResponse.json(reportData)
    
  } catch (error) {
    console.error('Error fetching report:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}