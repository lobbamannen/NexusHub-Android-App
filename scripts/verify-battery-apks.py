#!/usr/bin/env python3
"""Verify both APKs are signed by the same established identity and package."""
import os,re,subprocess,sys
from pathlib import Path
sdk=Path(os.environ['ANDROID_HOME'])/'build-tools'/'35.0.0'
def inspect(path):
 out=subprocess.check_output([str(sdk/'apksigner'),'verify','--print-certs',path],text=True)
 digest=re.search(r'Signer #1 certificate SHA-256 digest: (\S+)',out)
 if not digest:raise RuntimeError('Missing signer certificate')
 badging=subprocess.check_output([str(sdk/'aapt'),'dump','badging',path],text=True)
 if "package: name='se.lobbamannen.nexushub.app'" not in badging:raise RuntimeError('Unexpected installed package')
 return digest.group(1)
a,b=map(inspect,sys.argv[1:3])
if a!=b:raise RuntimeError('Phone and watch certificates do not match')
if len(sys.argv)>3 and a!=inspect(sys.argv[3]):raise RuntimeError('Release certificate differs from previously published phone APK')
print('Verified phone/watch package and matching SHA-256 signing certificate:',a)
