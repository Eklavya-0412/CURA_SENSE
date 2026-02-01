import requests
import time
import json
import sys

BASE_URL = "http://localhost:8000"
MERCHANT_ID = "MCH-DEMO-001"

def trigger_webhook():
    print(f"[*] Triggering Checkout Failure for {MERCHANT_ID}...")
    payload = {
        "merchant_id": MERCHANT_ID,
        "error_message": "Payment gateway timeout 504 during checkout flow",
        "error_code": "PAYMENT_504",
        "payment_method": "CreditCard",
        "cart_value": 149.99,
        "currency": "USD"
    }
    try:
        res = requests.post(f"{BASE_URL}/webhook/checkout-failure", json=payload)
        res.raise_for_status()
        print(f"[+] Webhook sent successfully. Response: {res.json()}")
        return res.json().get("session_id")
    except Exception as e:
        print(f"[-] Failed to trigger webhook: {e}")
        sys.exit(1)

def check_history():
    print(f"\n[*] Fetching history for {MERCHANT_ID}...")
    # Give it a moment to process
    time.sleep(2)
    
    try:
        res = requests.get(f"{BASE_URL}/agent/merchant/history/{MERCHANT_ID}")
        res.raise_for_status()
        history = res.json().get("sessions", [])
        
        print(f"[+] Found {len(history)} sessions in history:")
        for session in history:
            print(f"  - ID: {session.get('id')}")
            print(f"    Status: {session.get('status')}")
            print(f"    Auto-Detected: {session.get('is_auto_detected')}")
            print(f"    Timestamp: {session.get('timestamp')}")
            print("    ---")
            
        if len(history) > 0:
            print("\n[SUCCESS] History is populating correctly!")
        else:
            print("\n[FAILURE] History is still empty.")
            
    except Exception as e:
        print(f"[-] Failed to fetch history: {e}")

if __name__ == "__main__":
    trigger_webhook()
    check_history()
