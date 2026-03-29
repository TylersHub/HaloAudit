#!/usr/bin/env python3
"""Verify agent configuration and test connections."""

import sys
import httpx
from src.config import get_config

def test_config():
    """Test that configuration loads correctly."""
    try:
        config = get_config()
        print("✅ Configuration loaded successfully")
        print(f"   Edge URL: {config.edge_base_url}")
        print(f"   R2 Bucket: {config.r2_bucket}")
        print(f"   AI Gateway: {config.ai_gateway_url[:50]}...")
        return config
    except Exception as e:
        print(f"❌ Failed to load configuration: {e}")
        print("\nMake sure you have a .env file with all required variables.")
        return None

def test_backend_connection(config):
    """Test connection to backend."""
    print("\n🔍 Testing backend connection...")
    try:
        # Test health endpoint (no auth required)
        response = httpx.get(f"{config.edge_base_url}/", timeout=10.0)
        if response.status_code == 200:
            print("✅ Backend is reachable")
            data = response.json()
            print(f"   Service: {data.get('service', 'unknown')}")
            print(f"   Status: {data.get('status', 'unknown')}")
        else:
            print(f"⚠️  Backend returned status {response.status_code}")
            return False
    except httpx.ConnectError:
        print(f"❌ Cannot connect to {config.edge_base_url}")
        print("   Check that:")
        print("   1. Backend is deployed")
        print("   2. EDGE_BASE_URL is correct")
        print("   3. No firewall blocking the connection")
        return False
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return False

    # Test authenticated endpoint
    try:
        headers = {
            "Authorization": f"Bearer {config.edge_api_token}",
            "Content-Type": "application/json",
        }
        response = httpx.get(
            f"{config.edge_base_url}/jobs/stats",
            headers=headers,
            timeout=10.0,
        )
        if response.status_code == 200:
            print("✅ Backend authentication successful")
            data = response.json()
            print(f"   Job stats: {data.get('stats', {})}")
        elif response.status_code == 401:
            print("❌ Authentication failed")
            print("   Check that EDGE_API_TOKEN matches backend JWT_SECRET")
            return False
        else:
            print(f"⚠️  Backend returned status {response.status_code}")
            print(f"   Response: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Auth test error: {e}")
        return False

    return True

def test_r2_connection(config):
    """Test R2 connection."""
    print("\n🔍 Testing R2 connection...")
    try:
        import boto3
        from botocore.exceptions import ClientError

        s3_client = boto3.client(
            's3',
            endpoint_url=config.r2_endpoint,
            aws_access_key_id=config.r2_access_key_id,
            aws_secret_access_key=config.r2_secret_access_key,
        )

        # Try to list buckets or head bucket
        try:
            s3_client.head_bucket(Bucket=config.r2_bucket)
            print(f"✅ R2 bucket '{config.r2_bucket}' is accessible")
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            if error_code == '404':
                print(f"❌ R2 bucket '{config.r2_bucket}' not found")
                print("   Create the bucket in Cloudflare dashboard")
            elif error_code == '403':
                print(f"❌ Access denied to R2 bucket '{config.r2_bucket}'")
                print("   Check R2 credentials and permissions")
            else:
                print(f"❌ R2 error: {error_code}")
            return False
    except ImportError:
        print("⚠️  boto3 not installed, skipping R2 test")
        print("   Install with: pip install boto3")
    except Exception as e:
        print(f"❌ R2 connection error: {e}")
        return False

    return True

def main():
    """Run all verification tests."""
    print("=" * 60)
    print("Agent Configuration Verification")
    print("=" * 60)

    config = test_config()
    if not config:
        sys.exit(1)

    backend_ok = test_backend_connection(config)
    r2_ok = test_r2_connection(config)

    print("\n" + "=" * 60)
    if backend_ok and r2_ok:
        print("✅ All checks passed! Agent should be ready to run.")
        print("\nStart the agent with: python -m src.main")
    else:
        print("❌ Some checks failed. Please fix the issues above.")
        sys.exit(1)

if __name__ == "__main__":
    main()

