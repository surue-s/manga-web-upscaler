#!/usr/bin/env python3
"""
Extension Setup Verification Script
Checks all files and configuration needed for the extension to work
"""

import os
import json
from pathlib import Path

# Colors for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_status(check_name, passed, details=""):
    symbol = f"{GREEN}✓{RESET}" if passed else f"{RED}✗{RESET}"
    print(f"{symbol} {check_name}")
    if details:
        print(f"  {details}")

def check_file_exists(filepath, min_size_kb=0):
    """Check if file exists and optionally verify minimum size"""
    if not os.path.exists(filepath):
        return False, "File not found"
    
    if min_size_kb > 0:
        size_kb = os.path.getsize(filepath) / 1024
        if size_kb < min_size_kb:
            return False, f"File too small: {size_kb:.1f} KB (expected > {min_size_kb} KB)"
    
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    return True, f"Size: {size_mb:.2f} MB"

def main():
    print(f"\n{BLUE}=== Manga Web Upscaler Extension Verification ==={RESET}\n")
    
    # Base directory
    base_dir = Path(__file__).parent
    
    all_passed = True
    
    # 1. Check manifest.json
    print(f"{BLUE}[1] Checking manifest.json...{RESET}")
    manifest_path = base_dir / "manifest.json"
    exists, details = check_file_exists(manifest_path)
    print_status("manifest.json exists", exists, details)
    
    if exists:
        try:
            with open(manifest_path, 'r') as f:
                manifest = json.load(f)
            
            # Check critical fields
            has_csp = "content_security_policy" in manifest
            print_status("Has content_security_policy", has_csp)
            if has_csp:
                csp = manifest["content_security_policy"]["extension_pages"]
                has_wasm = "wasm-unsafe-eval" in csp
                print_status("Includes 'wasm-unsafe-eval'", has_wasm, 
                           f"CSP: {csp[:50]}..." if len(csp) > 50 else f"CSP: {csp}")
                all_passed &= has_wasm
            else:
                print_status("Missing CSP - ONNX won't work!", False)
                all_passed = False
            
            has_web_resources = "web_accessible_resources" in manifest
            print_status("Has web_accessible_resources", has_web_resources)
            all_passed &= has_web_resources
            
        except json.JSONDecodeError as e:
            print_status("manifest.json is valid JSON", False, str(e))
            all_passed = False
    else:
        all_passed = False
    
    print()
    
    # 2. Check model file
    print(f"{BLUE}[2] Checking AI model file...{RESET}")
    model_path = base_dir / "models" / "esrgan_anime_model.onnx"
    exists, details = check_file_exists(model_path, min_size_kb=1000)  # At least 1 MB
    print_status("esrgan_anime_model.onnx", exists, details)
    
    if exists:
        size_mb = os.path.getsize(model_path) / (1024 * 1024)
        if size_mb < 10:
            print(f"  {YELLOW}⚠ Warning: Model seems small ({size_mb:.2f} MB). Expected ~18 MB{RESET}")
        elif size_mb > 25:
            print(f"  {YELLOW}⚠ Warning: Model seems large ({size_mb:.2f} MB). Expected ~18 MB{RESET}")
    else:
        print(f"  {YELLOW}💡 To fix: Copy model from onnx/ directory{RESET}")
        print(f"     cp ../onnx/esrgan_anime_model.onnx.data models/esrgan_anime_model.onnx")
        all_passed = False
    
    print()
    
    # 3. Check icons
    print(f"{BLUE}[3] Checking icon files...{RESET}")
    icons = ["icon16.png", "icon48.png", "icon128.png"]
    for icon in icons:
        icon_path = base_dir / "icons" / icon
        exists, details = check_file_exists(icon_path)
        print_status(icon, exists, details)
        all_passed &= exists
    
    print()
    
    # 4. Check critical JS files
    print(f"{BLUE}[4] Checking JavaScript files...{RESET}")
    js_files = [
        ("service-worker.js", 1),
        ("popup/popup.js", 2),
        ("popup/popup.html", 1),
        ("content/content.js", 3),
        ("worker/inference-worker.js", 3),
    ]
    
    for js_file, min_kb in js_files:
        js_path = base_dir / js_file
        exists, details = check_file_exists(js_path, min_size_kb=min_kb)
        print_status(js_file, exists, details)
        all_passed &= exists
    
    print()
    
    # 5. Check for critical code patterns
    print(f"{BLUE}[5] Checking code patterns...{RESET}")
    
    # Check worker initialization
    content_js_path = base_dir / "content" / "content.js"
    if os.path.exists(content_js_path):
        with open(content_js_path, 'r') as f:
            content = f.read()
        
        has_init = "initializeWorker" in content
        print_status("Content script has initializeWorker()", has_init)
        all_passed &= has_init
        
        has_ready_handler = 'event.data.status === "ready"' in content
        print_status("Content script handles 'ready' message", has_ready_handler)
        all_passed &= has_ready_handler
    
    # Check worker model loading
    worker_js_path = base_dir / "worker" / "inference-worker.js"
    if os.path.exists(worker_js_path):
        with open(worker_js_path, 'r') as f:
            content = f.read()
        
        has_onnx_import = "onnxruntime-web" in content
        print_status("Worker imports ONNX Runtime", has_onnx_import)
        all_passed &= has_onnx_import
        
        has_model_url = "esrgan_anime_model.onnx" in content
        print_status("Worker references model file", has_model_url)
        all_passed &= has_model_url
        
        has_ready_message = 'status: "ready"' in content
        print_status("Worker sends 'ready' message", has_ready_message)
        all_passed &= has_ready_message
    
    print()
    
    # 6. Directory structure
    print(f"{BLUE}[6] Checking directory structure...{RESET}")
    required_dirs = ["models", "icons", "content", "worker", "popup"]
    for dir_name in required_dirs:
        dir_path = base_dir / dir_name
        exists = os.path.isdir(dir_path)
        print_status(f"{dir_name}/ directory", exists)
        all_passed &= exists
    
    print()
    
    # Final summary
    print(f"{BLUE}{'='*50}{RESET}")
    if all_passed:
        print(f"{GREEN}✓ All checks passed! Extension is ready to load.{RESET}\n")
        print(f"Next steps:")
        print(f"  1. Open chrome://extensions/")
        print(f"  2. Enable 'Developer mode'")
        print(f"  3. Click 'Load unpacked'")
        print(f"  4. Select this directory: {base_dir}")
        print(f"\n{YELLOW}Note: First run takes 30-60s to download ONNX Runtime and load model{RESET}\n")
    else:
        print(f"{RED}✗ Some checks failed. Please fix the issues above.{RESET}\n")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
