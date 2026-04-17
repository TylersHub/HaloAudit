"""Gemini AI client via Edge Worker proxy."""

import base64
import logging
from typing import Any

from .config import Config
from .edge_client import EdgeClient

logger = logging.getLogger(__name__)


class GeminiClient:
    """Client for Gemini AI via Edge Worker proxy."""

    def __init__(self, config: Config, edge_client: EdgeClient):
        self.config = config
        self.edge_client = edge_client

    def extract_text(self, file_bytes: bytes, mime_type: str) -> str:
        """
        Extract text from a document using Gemini's multimodal capabilities.

        Uses inlineData to send the document directly to Gemini for text extraction,
        avoiding the need for local OCR/parsing libraries.

        Args:
            file_bytes: Document bytes
            mime_type: MIME type (e.g., 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

        Returns:
            Extracted text content
        """
        # Base64 encode the file
        encoded_data = base64.b64encode(file_bytes).decode("utf-8")

        # Build the request payload
        contents = [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "Extract all readable text and tabular data from this document as UTF-8 plain text. "
                            "Preserve row/column order where possible. "
                            "Include all text content, tables, headers, and footers. "
                            "Do not add any commentary or explanation, just return the extracted text."
                        )
                    },
                    {"inlineData": {"mimeType": mime_type, "data": encoded_data}},
                ],
            }
        ]

        generation_config = {
            "temperature": 0.1,  # Low temperature for consistent extraction
            "maxOutputTokens": 8192,
        }

        logger.info(f"Extracting text from {len(file_bytes)} bytes ({mime_type})")

        # Call Gemini via edge proxy
        data = self.edge_client.llm_gateway(
            contents,
            generation_config,
            model=self.config.gemini_chat_model,
        )

        # Extract text from response
        try:
            candidates = data.get("candidates", [])
            if not candidates:
                logger.warning("No candidates in Gemini response")
                return ""

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])

            if not parts:
                logger.warning("No parts in Gemini response")
                return ""

            # Concatenate all text parts
            text = " ".join(part.get("text", "") for part in parts)
            logger.info(f"Extracted {len(text)} characters of text")
            return text.strip()

        except (KeyError, IndexError) as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            logger.debug(f"Response data: {data}")
            return ""

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for texts using Gemini's embedding model.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        # Build requests for each text
        requests = []
        for text in texts:
            requests.append(
                {
                    "model": self.config.gemini_embed_model,
                    "content": {"parts": [{"text": text}]},
                    "outputDimensionality": self.config.gemini_embed_dimensions,
                }
            )

        logger.info(f"Embedding {len(texts)} texts")

        # Call via edge proxy
        data = self.edge_client.llm_embed(requests)

        # Extract embeddings from response
        embeddings = []
        for embedding_data in data.get("embeddings", []):
            values = embedding_data.get("values", [])
            if values:
                embeddings.append(values)

        logger.info(f"Generated {len(embeddings)} embeddings")
        return embeddings

    def chat(
        self,
        prompt: str,
        model: str | None = None,
        context: list[dict[str, Any]] | None = None,
    ) -> str:
        """
        Chat with Gemini for analysis and summarization.

        Args:
            prompt: User prompt
            model: Model name
            context: Optional conversation context

        Returns:
            Generated text response
        """
        # Build conversation history
        contents = []
        if context:
            contents.extend(context)

        contents.append({"role": "user", "parts": [{"text": prompt}]})

        generation_config = {
            "temperature": 0.7,
            "maxOutputTokens": 2048,
        }

        logger.info(f"Chat request with {len(prompt)} char prompt")

        # Call via edge proxy
        data = self.edge_client.llm_gateway(
            contents,
            generation_config,
            model=model or self.config.gemini_chat_model,
        )

        # Extract text from response
        try:
            candidates = data.get("candidates", [])
            if not candidates:
                return ""

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])

            text = " ".join(part.get("text", "") for part in parts)
            logger.info(f"Generated {len(text)} characters of text")
            return text.strip()

        except (KeyError, IndexError) as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            return ""


