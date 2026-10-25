#!/usr/bin/env python3
"""Bootstrap/reuse one signing identity in a NEVER-publish GitHub draft release.

The draft's asset is readable only with repository push access. Do not publish,
delete, or rename this draft. No private signing material is committed or uploaded
as an Actions artifact. A public non-secret marker tag prevents silent key rotation.
"""
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = os.environ['GITHUB_REPOSITORY']
TOKEN = os.environ['GH_TOKEN']
TAG = 'android-signing-established-v1'
VAULT_TAG = 'android-signing-vault-v1'
ASSET = 'private-android-signing-v1.zip'
API = 'https://api.github.com'


class PrivateAssetRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected and urllib.parse.urlparse(req.full_url).netloc != urllib.parse.urlparse(newurl).netloc:
            redirected.remove_header('Authorization')
        return redirected


opener = urllib.request.build_opener(PrivateAssetRedirectHandler())


def request(path, data=None, method=None, binary=False, content_type=None):
    url = path if path.startswith('https://') else API + path
    headers = {'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/octet-stream' if binary else 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
    if data is not None and not isinstance(data, bytes):
        data = json.dumps(data).encode()
        headers['Content-Type'] = 'application/json'
    if content_type:
        headers['Content-Type'] = content_type
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with opener.open(req) as response:
        result = response.read()
        return result if binary else json.loads(result or b'{}')


def ensure_draft(release_id):
    release = request(f'/repos/{REPO}/releases/{release_id}')
    if release.get('draft') is not True or release.get('tag_name') != VAULT_TAG:
        raise RuntimeError('Signing vault is not the expected PRIVATE draft. Build stopped.')
    return release


releases = []
page = 1
while True:
    batch = request(f'/repos/{REPO}/releases?per_page=100&page={page}')
    releases.extend(batch)
    if len(batch) < 100:
        break
    page += 1
matches = [r for r in releases if r['tag_name'] == VAULT_TAG]
if len(matches) > 1:
    raise RuntimeError('Multiple signing vaults found; refusing to choose a key.')
vault = matches[0] if matches else None
if vault:
    vault = ensure_draft(vault['id'])
    assets = [a for a in vault['assets'] if a['name'] == ASSET]
    if len(assets) != 1:
        raise RuntimeError('Signing vault is incomplete. Restore its original key; never generate a replacement.')
    archive = request(f'/repos/{REPO}/releases/assets/{assets[0]["id"]}', binary=True)
    ensure_draft(vault['id'])
else:
    # A marker remains even if someone accidentally deletes the draft release.
    try:
        request(f'/repos/{REPO}/git/ref/tags/{TAG}')
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    else:
        raise RuntimeError('Signing vault is missing after initialization. Restore the ORIGINAL key.')
    # Reserve identity before creating any key: interrupted initialization fails closed.
    request(f'/repos/{REPO}/git/refs', {'ref': 'refs/tags/' + TAG, 'sha': os.environ['GITHUB_SHA']})
    vault = request(f'/repos/{REPO}/releases', {
        'tag_name': VAULT_TAG, 'target_commitish': os.environ['GITHUB_SHA'], 'draft': True,
        'name': 'PRIVATE ANDROID SIGNING VAULT — NEVER PUBLISH OR DELETE',
        'body': 'Contains the private APK signing identity. Keep this release a DRAFT forever. Publishing exposes the key. Deleting it prevents future compatible APK updates. Only repository writers may access it.'})
    ensure_draft(vault['id'])
    password = secrets.token_urlsafe(36)
    print('::add-mask::' + password)
    with tempfile.TemporaryDirectory() as temp:
        key = Path(temp) / 'nexushub.jks'
        env = os.environ | {'SIGNING_PASSWORD': password}
        subprocess.run(['keytool', '-genkeypair', '-keystore', str(key), '-storetype', 'PKCS12', '-alias', 'nexushub', '-storepass:env', 'SIGNING_PASSWORD', '-keypass:env', 'SIGNING_PASSWORD', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '36500', '-dname', 'CN=Nexus Hub App, OU=Android, O=Nexus Hub, C=SE'], env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w', zipfile.ZIP_DEFLATED) as bundle:
            bundle.write(key, 'nexushub.jks')
            bundle.writestr('password', password)
        archive = data.getvalue()
    upload = ensure_draft(vault['id'])['upload_url'].split('{')[0] + '?name=' + ASSET
    request(upload, archive, method='POST', content_type='application/zip')
    ensure_draft(vault['id'])

# Keep signing files outside the checkout and all uploaded build artifacts.
folder = Path(os.environ['RUNNER_TEMP']) / 'nexushub-signing'
folder.mkdir(mode=0o700, exist_ok=True)
with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
    key_data = bundle.read('nexushub.jks')
    password = bundle.read('password').decode()
print('::add-mask::' + password)
key = folder / 'nexushub.jks'
key.write_bytes(key_data)
key.chmod(0o600)
with open(os.environ['GITHUB_ENV'], 'a') as env:
    env.write(f'ANDROID_KEYSTORE_PATH={key}\nANDROID_KEYSTORE_PASSWORD={password}\n')
print('Original Android signing identity ready; private draft remains unpublished.')
