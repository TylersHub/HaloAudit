import { NextRequest, NextResponse } from 'next/server'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return ''
}

function joinLines(values: unknown[]): string {
  return values
    .map((value) => cleanString(value))
    .filter(Boolean)
    .join('\n')
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (!normalized || ['false', 'no', '0', 'none', 'null', 'n/a', 'not applicable'].includes(normalized)) {
      return false
    }

    if (['true', 'yes', '1', 'material', 'material_not_pervasive', 'material_pervasive'].includes(normalized)) {
      return true
    }

    return true
  }

  return false
}

function normalizeSectionText(
  value: unknown,
  options: {
    includeHeading?: boolean
    allowMatterLists?: boolean
  } = {}
): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim()
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeSectionText(item, options))
      .filter(Boolean)
      .join('\n\n')
  }

  if (!isRecord(value)) {
    return ''
  }

  if (options.allowMatterLists && Array.isArray(value.matters)) {
    const matters = value.matters
      .map((matter, index) => {
        if (!isRecord(matter)) {
          return normalizeSectionText(matter)
        }

        const title = cleanString(matter.title) || `Matter ${index + 1}`
        const whySignificant = cleanString(matter.why_significant)
        const howAddressed = cleanString(matter.how_addressed)

        return [
          title,
          whySignificant ? `Why significant: ${whySignificant}` : '',
          howAddressed ? `How addressed: ${howAddressed}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      })
      .filter(Boolean)

    if (matters.length > 0) {
      return matters.join('\n\n')
    }
  }

  const heading = cleanString(value.heading)
  const statement =
    cleanString(value.statement) ||
    cleanString(value.content) ||
    cleanString(value.text) ||
    cleanString(value.body) ||
    cleanString(value.reasoning) ||
    cleanString(value.description)

  if (heading || statement) {
    return options.includeHeading && heading
      ? joinLines([heading, statement])
      : statement || heading
  }

  if ('title' in value || 'addressee' in value) {
    return joinLines([value.title, value.addressee])
  }

  if ('signature' in value || 'partner_name' in value || 'city_state' in value || 'date' in value) {
    return joinLines([value.signature, value.partner_name, value.city_state, value.date])
  }

  return Object.values(value)
    .map((item) => normalizeSectionText(item, options))
    .filter(Boolean)
    .join('\n')
}

function normalizeOptionalSection(value: unknown): string | null {
  const normalized = normalizeSectionText(value, { allowMatterLists: true })
  return normalized || null
}

function normalizeExecutiveSummary(executiveSummary: unknown) {
  const rawSummary = isRecord(executiveSummary) ? executiveSummary : {}
  const rawDetermination = isRecord(rawSummary.determination) ? rawSummary.determination : {}
  const rawReport = isRecord(rawSummary.report) ? rawSummary.report : {}
  const rawAutomation = isRecord(rawSummary.machine_readable_summary_for_automation)
    ? rawSummary.machine_readable_summary_for_automation
    : {}

  const normalizedKeyAuditMatters =
    normalizeSectionText(rawReport.key_audit_matters, { allowMatterLists: true }) ||
    'Key audit matters are not applicable to the audit of this entity.'

  return {
    determination: {
      audit_standard:
        cleanString(rawDetermination.audit_standard) ||
        cleanString(rawAutomation.audit_standard) ||
        cleanString(rawAutomation.standard_used) ||
        'U.S. GAAS (AICPA AU-C)',
      opinion_type:
        cleanString(rawDetermination.opinion_type) ||
        cleanString(rawAutomation.opinion_type) ||
        'Unmodified',
      reasoning:
        normalizeSectionText(rawDetermination.reasoning) ||
        'Unable to parse report content',
    },
    report: {
      title_and_addressee:
        normalizeSectionText(rawReport.title_and_addressee) ||
        'Independent Auditor\'s Report\nTo the Board of Directors',
      opinion:
        normalizeSectionText(rawReport.opinion, { includeHeading: true }) ||
        'Opinion\nWe have audited the financial statements of the entity...',
      basis_for_opinion:
        normalizeSectionText(rawReport.basis_for_opinion) ||
        'In our opinion, the accompanying financial statements present fairly...',
      key_audit_matters: normalizedKeyAuditMatters,
      responsibilities_of_management_and_governance:
        normalizeSectionText(rawReport.responsibilities_of_management_and_governance) ||
        'Management is responsible for the preparation and fair presentation of the financial statements...',
      auditor_responsibilities:
        normalizeSectionText(rawReport.auditor_responsibilities) ||
        'Our responsibility is to express an opinion on these financial statements...',
      emphasis_of_matter: normalizeOptionalSection(rawReport.emphasis_of_matter),
      other_matter: normalizeOptionalSection(rawReport.other_matter),
      other_information: normalizeOptionalSection(rawReport.other_information),
      legal_and_regulatory: normalizeOptionalSection(rawReport.legal_and_regulatory),
      signature_sign_off:
        normalizeSectionText(rawReport.signature_sign_off) ||
        '[Auditor Agent]\n[San Francisco, CA]\n[Date]',
    },
    machine_readable_summary_for_automation: {
      audit_standard:
        cleanString(rawAutomation.audit_standard) ||
        cleanString(rawAutomation.standard_used) ||
        cleanString(rawDetermination.audit_standard) ||
        'GAAS',
      opinion_type:
        cleanString(rawAutomation.opinion_type) ||
        cleanString(rawDetermination.opinion_type) ||
        'Unmodified',
      scope_limitation:
        normalizeBoolean(rawAutomation.scope_limitation) ||
        normalizeBoolean(rawAutomation.has_scope_limitations),
      material_misstatement:
        normalizeBoolean(rawAutomation.material_misstatement) ||
        normalizeBoolean(rawAutomation.has_identified_misstatements),
      going_concern:
        normalizeBoolean(rawAutomation.going_concern) ||
        normalizeBoolean(rawAutomation.has_going_concern_uncertainty),
      key_audit_matters:
        normalizeBoolean(rawAutomation.key_audit_matters) ||
        normalizeBoolean(rawAutomation.has_key_audit_matters) ||
        !normalizedKeyAuditMatters.toLowerCase().includes('not applicable'),
      other_information:
        normalizeBoolean(rawAutomation.other_information) ||
        normalizeBoolean(rawAutomation.has_other_information) ||
        normalizeBoolean(rawAutomation.other_information_present),
      legal_regulatory:
        normalizeBoolean(rawAutomation.legal_regulatory) ||
        normalizeBoolean(rawAutomation.has_legal_regulatory_requirements),
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const runId = searchParams.get('runId')
    const reportUrl = searchParams.get('url')
    const backendUrl = process.env.BACKEND_URL || 'https://auditor-edge.18tyler-rosa1.workers.dev'

    if (reportUrl) {
      const allowedPrefixes = [
        `${backendUrl}/runs/`,
        'http://localhost:8787/runs/',
        'http://127.0.0.1:8787/runs/',
      ]

      if (!allowedPrefixes.some((prefix) => reportUrl.startsWith(prefix))) {
        return NextResponse.json(
          { error: 'Unsupported report URL' },
          { status: 400 }
        )
      }

      const response = await fetch(reportUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'text/markdown',
        },
      })

      if (!response.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch report from backend' },
          { status: response.status }
        )
      }

      const content = await response.text()
      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }
    
    if (!runId) {
      return NextResponse.json(
        { error: 'Run ID or report URL is required' },
        { status: 400 }
      )
    }
    
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
          
          executiveSummary = normalizeExecutiveSummary(JSON.parse(jsonString))
        } catch (jsonError) {
          console.error('Failed to parse JSON from report:', jsonError)
          executiveSummary = normalizeExecutiveSummary(null)
        }
      } else {
        // Fallback if no JSON found
        executiveSummary = normalizeExecutiveSummary(null)
      }
      
      // Count findings from the markdown
      const findingsSection = reportContent.match(/## Findings \(\d+\)([\s\S]*?)## Analysis Metadata/)
      let findings: Array<{
        id: string
        code: string
        severity: string
        title: string
        detail: string
        evidence_r2_key?: string
      }> = []
      
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
        executiveSummary: normalizeExecutiveSummary({
          determination: {
            audit_standard: 'U.S. GAAS (AICPA AU-C)',
            opinion_type: 'Unmodified',
            reasoning: 'The entity is a U.S. private company (non-issuer), so U.S. GAAS applies.'
          }
        }),
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
