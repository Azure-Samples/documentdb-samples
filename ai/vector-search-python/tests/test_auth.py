"""Offline regression tests for the vector-search sample's OIDC callback.

Run from ai/vector-search-python with:
    python -m unittest discover -s tests -v
"""

import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from azure.core.credentials import AccessToken
from pymongo.auth_oidc import OIDCCallback, OIDCCallbackContext, OIDCCallbackResult


# Import the sample without reading a local .env file or accessing credentials.
UTILS_PATH = Path(__file__).resolve().parents[1] / "src" / "utils.py"
SPEC = importlib.util.spec_from_file_location("vector_search_utils", UTILS_PATH)
utils = importlib.util.module_from_spec(SPEC)
with patch("dotenv.load_dotenv"):
    SPEC.loader.exec_module(utils)


class PasswordlessAuthTests(unittest.TestCase):
    def setUp(self):
        self.context = OIDCCallbackContext(
            timeout_seconds=60, username="", version=1
        )
        self.credential = Mock()
        self.credential.get_token.return_value = AccessToken(
            "mock-documentdb-token", 2_000_000_000
        )

    def test_callback_requests_documentdb_scope_and_returns_driver_result(self):
        callback = utils.AzureIdentityTokenCallback(self.credential)

        result = callback.fetch(self.context)

        self.assertIsInstance(callback, OIDCCallback)
        self.credential.get_token.assert_called_once_with(
            "https://ossrdbms-aad.database.windows.net/.default"
        )
        self.assertIsInstance(result, OIDCCallbackResult)
        self.assertEqual(result.access_token, "mock-documentdb-token")
        # PyMongo permits omitted expiry. Preserve that behavior rather than
        # interpreting Azure's absolute expires_on as a duration in seconds.
        self.assertIsNone(result.expires_in_seconds)
        self.assertIsNone(result.refresh_token)

    def test_passwordless_clients_use_the_callback(self):
        environment = {
            "MONGO_CLUSTER_NAME": "example-cluster",
            "AZURE_OPENAI_EMBEDDING_ENDPOINT": "https://example.openai.azure.com/",
        }
        with patch.dict(os.environ, environment, clear=True), patch.object(
            utils, "DefaultAzureCredential", return_value=self.credential
        ) as credential_factory, patch.object(
            utils, "MongoClient"
        ) as mongo_factory, patch.object(utils, "AzureOpenAI") as openai_factory:
            mongo_client, openai_client = utils.get_clients_passwordless()

        credential_factory.assert_called_once_with()
        self.credential.get_token.assert_not_called()
        self.assertIs(mongo_client, mongo_factory.return_value)
        self.assertIs(openai_client, openai_factory.return_value)
        mongo_options = mongo_factory.call_args.kwargs
        self.assertEqual(mongo_options["authMechanism"], "MONGODB-OIDC")
        self.assertEqual(
            mongo_factory.call_args.args,
            ("mongodb+srv://example-cluster.global.mongocluster.cosmos.azure.com/",),
        )
        callback = mongo_options["authMechanismProperties"]["OIDC_CALLBACK"]
        self.assertIsInstance(callback, utils.AzureIdentityTokenCallback)
        self.assertIs(callback.credential, self.credential)
        self.assertEqual(callback.fetch(self.context).access_token, "mock-documentdb-token")
        self.credential.get_token.assert_called_once_with(
            "https://ossrdbms-aad.database.windows.net/.default"
        )

        # The separate OpenAI token provider keeps its own audience.
        self.credential.get_token.reset_mock()
        provider = openai_factory.call_args.kwargs["azure_ad_token_provider"]
        self.assertEqual(provider(), "mock-documentdb-token")
        self.credential.get_token.assert_called_once_with(
            "https://cognitiveservices.azure.com/.default"
        )

    def test_obsolete_function_is_not_exposed(self):
        self.assertFalse(hasattr(utils, "azure_identity_token_callback"))


if __name__ == "__main__":
    unittest.main()
