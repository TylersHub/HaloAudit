"""LangGraph node implementations for the audit pipeline."""

import logging
import random
import re
import time
from typing import Any

import orjson

from ..checks.deterministic import run_all_checks
from ..config import Config
from ..edge_client import EdgeClient
from ..gemini import GeminiClient
from ..r2 import R2Client
from ..state import RunState, Txn

logger = logging.getLogger(__name__)


def ingest(state: RunState, r2_client: R2Client, edge_client: EdgeClient) -> RunState:
    """
    Download file from R2 and detect MIME type.

    Args:
        state: Current run state
        r2_client: R2 client instance
        edge_client: Edge client for event emission

    Returns:
        Updated state with file data
    """
    logger.info(f"[{state.run_id}] Starting ingest phase")
    edge_client.emit_event(state.run_id, "info", "Downloading file from R2")

    try:
        # Download file
        file_bytes = r2_client.get_object(state.r2_key)

        # Get metadata to detect MIME type
        metadata = r2_client.get_object_metadata(state.r2_key)
        mime_type = metadata.get("content_type")

        # Fallback: detect from filename extension
        if not mime_type:
            if state.r2_key.lower().endswith(".pdf"):
                mime_type = "application/pdf"
            elif state.r2_key.lower().endswith((".doc", ".docx")):
                mime_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            elif state.r2_key.lower().endswith(".csv"):
                mime_type = "text/csv"
            else:
                mime_type = "application/octet-stream"

        state.mime_type = mime_type
        state.file_bytes = file_bytes
        logger.info(f"[{state.run_id}] Downloaded {len(file_bytes)} bytes ({mime_type})")

        edge_client.emit_event(
            state.run_id,
            "info",
            f"File downloaded: {len(file_bytes)} bytes",
            {"mime_type": mime_type},
        )

    except Exception as e:
        logger.error(f"[{state.run_id}] Ingest failed: {e}")
        state.error = f"Ingest failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Ingest failed: {e}")

    return state


def extract_text_with_gemini(
    state: RunState, gemini_client: GeminiClient, edge_client: EdgeClient
) -> RunState:
    """
    Extract text from document using Gemini's multimodal capabilities.

    Args:
        state: Current run state
        gemini_client: Gemini client instance
        edge_client: Edge client for event emission

    Returns:
        Updated state with extracted text
    """
    if state.error:
        return state

    logger.info(f"[{state.run_id}] Starting text extraction with Gemini")
    edge_client.emit_event(state.run_id, "info", "Extracting text with Gemini AI")

    try:
        if not state.file_bytes:
            raise ValueError("No file bytes available")

        # Extract text using Gemini
        raw_text = gemini_client.extract_text(state.file_bytes, state.mime_type or "application/pdf")
        state.raw_text = raw_text

        logger.info(f"[{state.run_id}] Extracted {len(raw_text)} characters")
        edge_client.emit_event(
            state.run_id,
            "info",
            f"Text extracted: {len(raw_text)} characters",
        )

        # Clean up file bytes to save memory
        state.file_bytes = None

    except Exception as e:
        logger.error(f"[{state.run_id}] Text extraction failed: {e}")
        state.error = f"Text extraction failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Text extraction failed: {e}")

    return state


def chunk(state: RunState, edge_client: EdgeClient) -> RunState:
    """
    Split text into chunks for embedding.

    Args:
        state: Current run state
        edge_client: Edge client for event emission

    Returns:
        Updated state with chunks
    """
    if state.error or not state.raw_text:
        return state

    logger.info(f"[{state.run_id}] Starting chunking")
    edge_client.emit_event(state.run_id, "info", "Chunking text")

    try:
        # Simple chunking by length (roughly 1000-2000 chars per chunk)
        text = state.raw_text
        chunk_size = 1500
        overlap = 200

        chunks = []
        start = 0

        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]

            # Try to break at sentence boundary
            if end < len(text):
                last_period = chunk_text.rfind(".")
                last_newline = chunk_text.rfind("\n")
                break_point = max(last_period, last_newline)

                if break_point > chunk_size * 0.7:  # At least 70% of chunk
                    chunk_text = text[start : start + break_point + 1]
                    end = start + break_point + 1

            chunks.append(chunk_text.strip())
            start = end - overlap if end < len(text) else end

        state.chunks = chunks
        logger.info(f"[{state.run_id}] Created {len(chunks)} chunks")
        edge_client.emit_event(state.run_id, "info", f"Created {len(chunks)} text chunks")

    except Exception as e:
        logger.error(f"[{state.run_id}] Chunking failed: {e}")
        state.error = f"Chunking failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Chunking failed: {e}")

    return state


def embed(state: RunState, gemini_client: GeminiClient, edge_client: EdgeClient) -> RunState:
    """
    Generate embeddings for chunks using Gemini.

    Args:
        state: Current run state
        gemini_client: Gemini client instance
        edge_client: Edge client for event emission

    Returns:
        Updated state with embeddings
    """
    if state.error or not state.chunks:
        return state

    logger.info(f"[{state.run_id}] Starting embedding")
    edge_client.emit_event(state.run_id, "info", "Generating embeddings")

    try:
        # Generate embeddings
        embeddings = gemini_client.embed_texts(state.chunks)
        state.embeddings = embeddings

        # Generate vector IDs
        state.vector_ids = [f"run:{state.run_id}:ch:{i}" for i in range(len(state.chunks))]

        logger.info(f"[{state.run_id}] Generated {len(embeddings)} embeddings")
        edge_client.emit_event(
            state.run_id,
            "info",
            f"Generated {len(embeddings)} embeddings",
        )

    except Exception as e:
        logger.error(f"[{state.run_id}] Embedding failed: {e}")
        state.error = f"Embedding failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Embedding failed: {e}")

    return state


def index(state: RunState, edge_client: EdgeClient) -> RunState:
    """
    Index embeddings in Vectorize via edge proxy.

    Args:
        state: Current run state
        edge_client: Edge client instance

    Returns:
        Updated state
    """
    if state.error or not state.embeddings:
        return state

    logger.info(f"[{state.run_id}] Starting indexing")
    edge_client.emit_event(state.run_id, "info", "Indexing vectors")

    try:
        # Prepare metadata
        metadatas = [
            {
                "run_id": state.run_id,
                "tenant_id": state.tenant_id,
                "chunk_index": i,
                "text_preview": chunk[:100],
            }
            for i, chunk in enumerate(state.chunks)
        ]

        # Upsert to Vectorize
        edge_client.vector_upsert(
            ids=state.vector_ids,
            vectors=state.embeddings,
            metadatas=metadatas,
        )

        logger.info(f"[{state.run_id}] Indexed {len(state.vector_ids)} vectors")
        edge_client.emit_event(
            state.run_id,
            "info",
            f"Indexed {len(state.vector_ids)} vectors",
        )

    except Exception as e:
        logger.error(f"[{state.run_id}] Indexing failed: {e}")
        state.error = f"Indexing failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Indexing failed: {e}")

    return state


def checks(state: RunState, edge_client: EdgeClient) -> RunState:
    """
    Run deterministic audit checks.

    Args:
        state: Current run state
        edge_client: Edge client for event emission

    Returns:
        Updated state with findings
    """
    if state.error:
        return state

    logger.info(f"[{state.run_id}] Running deterministic checks")
    edge_client.emit_event(state.run_id, "info", "Running audit checks")

    try:
        # Extract transactions from text (simple regex-based extraction)
        # In production, this would be more sophisticated
        transactions = extract_transactions_from_text(state.raw_text or "")
        state.txns = transactions

        # Run all checks
        findings = run_all_checks(state)
        state.findings = findings

        logger.info(f"[{state.run_id}] Found {len(findings)} issues")
        edge_client.emit_event(
            state.run_id,
            "info",
            f"Audit checks complete: {len(findings)} findings",
        )

    except Exception as e:
        logger.error(f"[{state.run_id}] Checks failed: {e}")
        state.error = f"Checks failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Checks failed: {e}")

    return state


def analyze(
    state: RunState, gemini_client: GeminiClient, edge_client: EdgeClient
) -> RunState:
    """
    Use Gemini to analyze findings and generate summary.

    Args:
        state: Current run state
        gemini_client: Gemini client instance
        edge_client: Edge client for event emission

    Returns:
        Updated state with summary
    """
    if state.error:
        return state

    logger.info(f"[{state.run_id}] Starting AI analysis")
    edge_client.emit_event(state.run_id, "info", "Analyzing with Gemini AI")

    try:
        # Build audit context for professional report generation
        findings_text = "\n".join(
            [
                f"- {f['severity'].upper()}: {f['title']} - {f['detail']}"
                for f in state.findings
            ]
        )

        # Determine audit parameters from document analysis
        audit_context = {
            "company_name": "Document Entity",  # Could be extracted from document
            "jurisdiction": "United States",  # Default, could be inferred
            "entity_type": "Private",  # Default for document audit
            "listing_status": "Non-issuer",
            "industry": "General Business",
            "financial_reporting_framework": "U.S. GAAP",
            "engagement_type": "External financial statement audit",
            "period_end": "2024-12-31",  # Could be extracted from document
            "scope_limitations": len(state.findings) > 0 and any(f.get('severity') == 'high' for f in state.findings),
            "identified_misstatements": "none" if len(state.findings) == 0 else "material_not_pervasive" if len(state.findings) < 3 else "material_pervasive",
            "going_concern_uncertainty": any('going concern' in f.get('title', '').lower() for f in state.findings),
            "key_audit_matters_input": [
                {"title": f["title"], "why_significant": f["detail"], "how_addressed": "Document review and analysis procedures"}
                for f in state.findings if f.get('severity') == 'high'
            ],
            "other_information_present": False,
            "legal_regulatory_requirements": [],
            "auditor_firm_name": "Auditor Agent",
            "auditor_city_state": "San Francisco, CA",
            "auditor_partner_name": "AI Auditor",
            "report_date": "2024-12-31"
        }

        prompt = f"""SYSTEM:
You are an expert independent auditor. Your job is to (A) determine the proper auditing STANDARD and OPINION TYPE from the inputs, then (B) return ONE JSON object that fully represents a professional audit report.

Follow these rules:
1) Determine FIRST:
   • If the entity is a U.S. public company (issuer) → use PCAOB standards.
   • If the entity is a U.S. private company (non-issuer) → use U.S. GAAS (AICPA AU-C).
   • If the engagement is international (non-U.S.) → use ISA (IAASB).
   • If government audit criteria are explicitly requested in the U.S. → consider GAGAS/Yellow Book in addition to GAAS.

2) Determine OPINION TYPE:
   • Unmodified/Clean: sufficient appropriate evidence; no material misstatement; no pervasive departure from the framework.
   • Qualified: material but not pervasive misstatement OR scope limitation.
   • Adverse: pervasive material misstatement.
   • Disclaimer: pervasive scope limitation / insufficient evidence to opine.

3) Output ONLY valid JSON (UTF-8). No extra text. No markdown. No commentary.

4) JSON MUST include:
   • determination (what standard/opinion you chose and why)
   • report (full report body)
   • machine_readable_summary_for_automation (flags)

5) Use the following section structure in the report:
   Title & Addressee, Opinion, Basis for Opinion, (optional) Key Audit Matters, Responsibilities of Management & Governance, Auditor's Responsibilities, (conditional) Emphasis of Matter, (conditional) Other Matter, (conditional) Other Information, (conditional) Legal & Regulatory, Signature/Sign-off.

6) If KAMs are required (e.g., ISA listed entities), populate them. Otherwise mark not applicable.

7) Keep wording professional and compliant with GAAS / PCAOB / ISA conventions. Use the reporting framework (e.g., U.S. GAAP, IFRS) exactly as provided.

USER INPUT (JSON):
{orjson.dumps(audit_context, option=orjson.OPT_INDENT_2).decode()}

AUDIT FINDINGS FROM DOCUMENT ANALYSIS:
{findings_text if findings_text else "No significant findings detected."}

Document analyzed: {len(state.chunks)} sections, {len(state.txns)} transactions reviewed.

OUTPUT ONLY THIS JSON SCHEMA (fill all applicable fields; omit arrays if empty):"""

        # Call Gemini for professional audit report generation
        audit_report_json = gemini_client.chat(prompt)
        state.summary = audit_report_json

        logger.info(f"[{state.run_id}] Generated analysis summary")
        edge_client.emit_event(state.run_id, "info", "AI analysis complete")

    except Exception as e:
        logger.error(f"[{state.run_id}] Analysis failed: {e}")
        state.error = f"Analysis failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Analysis failed: {e}")

    return state


def report(state: RunState, r2_client: R2Client, edge_client: EdgeClient) -> RunState:
    """
    Generate and upload report to R2.

    Args:
        state: Current run state
        r2_client: R2 client instance
        edge_client: Edge client for event emission

    Returns:
        Updated state with report key
    """
    if state.error:
        return state

    logger.info(f"[{state.run_id}] Generating report")
    edge_client.emit_event(state.run_id, "info", "Generating report")

    try:
        # Generate Markdown report
        report_md = generate_markdown_report(state)

        # Upload to R2
        report_key = f"reports/{state.tenant_id}/{state.run_id}/report.md"
        r2_client.put_object(report_key, report_md, content_type="text/markdown")

        state.report_r2_key = report_key
        logger.info(f"[{state.run_id}] Report uploaded to {report_key}")
        edge_client.emit_event(state.run_id, "info", f"Report uploaded: {report_key}")

    except Exception as e:
        logger.error(f"[{state.run_id}] Report generation failed: {e}")
        state.error = f"Report generation failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Report generation failed: {e}")

    return state


def persist(state: RunState, edge_client: EdgeClient) -> RunState:
    """
    Persist findings to D1 and update run status.

    Args:
        state: Current run state
        edge_client: Edge client instance

    Returns:
        Final state
    """
    logger.info(f"[{state.run_id}] Persisting results")
    edge_client.emit_event(
        state.run_id,
        "info",
        "Saving results to database" if not state.error else "Saving failure state to database",
    )

    try:
        # Insert each finding
        for i, finding in enumerate(state.findings):
            finding_id = f"finding_{state.run_id}_{i}_{int(time.time())}"
            edge_client.insert_finding(
                finding_id=finding_id,
                run_id=state.run_id,
                code=finding["code"],
                severity=finding["severity"],
                title=finding["title"],
                detail=finding["detail"],
                evidence_r2_key=None,
            )

        # Update run status
        final_status = "done" if not state.error else "error"
        edge_client.update_run_status(state.run_id, final_status)

        # Emit final event with summary
        edge_client.emit_event(
            state.run_id,
            "info" if not state.error else "error",
            "Audit complete" if not state.error else f"Audit failed: {state.error}",
            {
                "summary": state.summary,
                "report_key": state.report_r2_key,
                "findings_count": len(state.findings),
                "error": state.error,
            },
        )

        logger.info(f"[{state.run_id}] Results persisted successfully")

    except Exception as e:
        logger.error(f"[{state.run_id}] Persist failed: {e}")
        state.error = f"Persist failed: {str(e)}"
        edge_client.emit_event(state.run_id, "error", f"Persist failed: {e}")

    return state


# Helper functions


def extract_transactions_from_text(text: str) -> list[Txn]:
    """
    Simple transaction extraction from text using regex patterns.
    In production, this would use more sophisticated parsing.
    """
    transactions = []

    # Look for dollar amounts with dates
    # Pattern: date (various formats) ... amount
    pattern = r"(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}).*?\$?([\d,]+\.\d{2})"

    matches = re.findall(pattern, text)

    for i, (date, amount) in enumerate(matches[:100]):  # Limit to 100
        try:
            clean_amount = float(amount.replace(",", ""))
            txn = Txn(
                id=f"txn_{i}",
                amount=clean_amount,
                date=date,
                memo=None,
                vendor=None,
            )
            transactions.append(txn)
        except ValueError:
            continue

    logger.info(f"Extracted {len(transactions)} transactions from text")
    return transactions


def generate_markdown_report(state: RunState) -> str:
    """Generate a Markdown audit report from JSON audit report."""
    try:
        # Parse the JSON audit report if available
        if state.summary and state.summary.strip().startswith('{'):
            audit_data = orjson.loads(state.summary.strip())
            return generate_professional_audit_report(audit_data, state)
        else:
            # Fallback to simple format if JSON parsing fails
            return generate_simple_audit_report(state)
    except Exception as e:
        logger.warning(f"Failed to parse JSON audit report, using simple format: {e}")
        return generate_simple_audit_report(state)


def generate_professional_audit_report(audit_data: dict, state: RunState) -> str:
    """Generate a professional audit report from JSON audit data."""
    report_data = audit_data.get("report") or {}

    if isinstance(report_data, str):
        return f"""{report_data}

---

## Technical Details

- **Run ID:** {state.run_id}
- **Tenant ID:** {state.tenant_id}
- **Source:** {state.r2_key}
- **Generated:** {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}
- **Text Chunks:** {len(state.chunks)}
- **Vectors Indexed:** {len(state.vector_ids)}
- **Transactions Reviewed:** {len(state.txns)}
- **MIME Type:** {state.mime_type}

_Generated by Auditor Agent_
"""

    if all(
        key in report_data
        for key in [
            "title_and_addressee",
            "opinion",
            "basis_for_opinion",
            "responsibilities_of_management_and_governance",
            "auditor_responsibilities",
            "signature_sign_off",
        ]
    ):
        title_and_addressee = str(report_data["title_and_addressee"]).strip()
        title_lines = [line.strip() for line in title_and_addressee.splitlines() if line.strip()]
        title = title_lines[0] if title_lines else "Audit Report"
        addressee = "\n".join(title_lines[1:])

        report = f"""# {title}

{addressee}

## Opinion

{report_data["opinion"]}

## Basis for Opinion

{report_data["basis_for_opinion"]}

"""

        optional_sections = [
            ("Key Audit Matters", report_data.get("key_audit_matters")),
            (
                "Responsibilities of Management and Those Charged with Governance",
                report_data.get("responsibilities_of_management_and_governance"),
            ),
            ("Auditor's Responsibilities", report_data.get("auditor_responsibilities")),
            ("Emphasis of Matter", report_data.get("emphasis_of_matter")),
            ("Other Matter", report_data.get("other_matter")),
            ("Other Information", report_data.get("other_information")),
            ("Legal and Regulatory Requirements", report_data.get("legal_and_regulatory")),
        ]

        for heading, content in optional_sections:
            if content and str(content).strip() and "not applicable" not in str(content).lower():
                report += f"## {heading}\n\n{content}\n\n"

        report += f"""---

{report_data["signature_sign_off"]}

---

## Technical Details

- **Run ID:** {state.run_id}
- **Tenant ID:** {state.tenant_id}
- **Source:** {state.r2_key}
- **Generated:** {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}
- **Text Chunks:** {len(state.chunks)}
- **Vectors Indexed:** {len(state.vector_ids)}
- **Transactions Reviewed:** {len(state.txns)}
- **MIME Type:** {state.mime_type}

_Generated by Auditor Agent_
"""
        return report

    report = f"""# {audit_data['report']['title']}

{audit_data['report']['addressee']}

## Opinion

{audit_data['report']['opinion_section']['opinion_text']}

## Basis for Opinion

We conducted our audit in accordance with {', '.join(audit_data['report']['basis_for_opinion']['standards_referenced'])}. Our responsibilities under those standards are further described in the Auditor's Responsibilities section of our report. We are required to be independent of {audit_data['report']['entity_information']['company_name']} and to meet our other ethical responsibilities, in accordance with the relevant ethical requirements.

We believe that the audit evidence we have obtained is sufficient and appropriate to provide a basis for our opinion.

"""

    # Key Audit Matters section
    if audit_data['report']['key_audit_matters']['is_applicable']:
        report += "## Key Audit Matters\n\n"
        for matter in audit_data['report']['key_audit_matters']['matters']:
            report += f"### {matter['title']}\n\n"
            report += f"**Why significant:** {matter['why_significant']}\n\n"
            report += f"**How we addressed it:** {matter['how_addressed']}\n\n"

    # Responsibilities sections
    report += f"""## Responsibilities of Management and Those Charged with Governance

{audit_data['report']['responsibilities_of_management_and_those_charged_with_governance']['management_responsibilities']}

{audit_data['report']['responsibilities_of_management_and_those_charged_with_governance']['governance_responsibilities']}

## Auditor's Responsibilities

{audit_data['report']['auditor_responsibilities']['reasonable_assurance']}

{audit_data['report']['auditor_responsibilities']['risk_assessment']}

{audit_data['report']['auditor_responsibilities']['internal_control']}

{audit_data['report']['auditor_responsibilities']['procedures_summary']}

{audit_data['report']['auditor_responsibilities']['fraud_considerations']}

{audit_data['report']['auditor_responsibilities']['communication_with_governance']}

"""

    # Emphasis of Matter
    if audit_data['report']['emphasis_of_matter']['present']:
        report += "## Emphasis of Matter\n\n"
        for paragraph in audit_data['report']['emphasis_of_matter']['paragraphs']:
            report += f"{paragraph}\n\n"

    # Other Matter
    if audit_data['report']['other_matter']['present']:
        report += "## Other Matter\n\n"
        for paragraph in audit_data['report']['other_matter']['paragraphs']:
            report += f"{paragraph}\n\n"

    # Other Information
    if audit_data['report']['other_information_section']['present']:
        report += "## Other Information\n\n"
        report += f"{audit_data['report']['other_information_section']['scope']}\n\n"
        if audit_data['report']['other_information_section']['disclaimer_text_if_present']:
            report += f"{audit_data['report']['other_information_section']['disclaimer_text_if_present']}\n\n"

    # Legal and Regulatory
    if audit_data['report']['legal_and_regulatory_requirements']['present']:
        report += "## Legal and Regulatory Requirements\n\n"
        for disclosure in audit_data['report']['legal_and_regulatory_requirements']['jurisdictional_disclosures']:
            report += f"- {disclosure}\n"

    # Sign-off
    signoff = audit_data['report']['signoff']
    report += f"""
---

**{signoff['auditor_firm_name']}**  
{signoff['city_state']}  
{signoff['report_date']}

{signoff['partner_signature_block']}

---

## Technical Details

- **Run ID:**** {state.run_id}  
- **Tenant ID:** {state.tenant_id}  
- **Source:** {state.r2_key}  
- **Generated:** {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}
- **Text Chunks:** {len(state.chunks)}
- **Vectors Indexed:** {len(state.vector_ids)}
- **Transactions Reviewed:** {len(state.txns)}
- **MIME Type:** {state.mime_type}

_Generated by Auditor Agent_
"""

    return report


def generate_simple_audit_report(state: RunState) -> str:
    """Generate a simple audit report as fallback."""
    report = f"""# Audit Report

**Run ID:** {state.run_id}  
**Tenant ID:** {state.tenant_id}  
**Source:** {state.r2_key}  
**Generated:** {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}

---

## Executive Summary

{state.summary or "No summary available."}

---

## Findings ({len(state.findings)})

"""

    if state.findings:
        for i, finding in enumerate(state.findings, 1):
            severity = finding["severity"].upper()
            report += f"""
### {i}. {finding['title']} [{severity}]

**Code:** {finding['code']}  
**Details:** {finding['detail']}

"""
    else:
        report += "\n_No significant findings detected._\n"

    report += f"""
---

## Analysis Metadata

- **Text Chunks:** {len(state.chunks)}
- **Vectors Indexed:** {len(state.vector_ids)}
- **Transactions Reviewed:** {len(state.txns)}
- **MIME Type:** {state.mime_type}

---

_Generated by Auditor Agent_
"""

    return report

