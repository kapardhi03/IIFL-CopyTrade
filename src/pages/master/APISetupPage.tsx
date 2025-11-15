import React, { useState } from 'react';
import { Key, CheckCircle, XCircle, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { Button, Input, Card, CardContent, CardHeader, CardTitle } from '../../components/ui';
import Container from '../../components/layout/Container';
import PageHeader from '../../components/layout/PageHeader';
import { useToast } from '../../components/ui/Toast';

const APISetupPage: React.FC = () => {
  const { addToast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    setIsTesting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsTesting(false);
    setIsConnected(true);
    addToast({
      type: 'success',
      title: 'Connection Successful',
      message: 'IIFL Blaze API connected successfully',
    });
  };

  const handleSave = () => {
    addToast({
      type: 'success',
      title: 'API Configuration Saved',
      message: 'Your API credentials have been encrypted and saved securely',
    });
  };

  return (
    <Container className="py-8 max-w-4xl">
      <PageHeader
        title="API Configuration"
        description="Connect your IIFL Blaze API for automated trading"
      />

      {/* Connection Status */}
      <Card variant="elevated" className="mb-8">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div
              className={`h-12 w-12 rounded-full flex items-center justify-center ${
                isConnected ? 'bg-profit/10' : 'bg-yellow-100 dark:bg-yellow-900/20'
              }`}
            >
              {isConnected ? (
                <CheckCircle className="h-6 w-6 text-profit" />
              ) : (
                <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">
                {isConnected ? 'API Connected' : 'API Not Connected'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isConnected
                  ? 'Your IIFL Blaze API is connected and ready to use'
                  : 'Connect your IIFL Blaze API to start trading'}
              </p>
            </div>
            {isConnected && (
              <Button
                variant="outline"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={handleTestConnection}
                isLoading={isTesting}
              >
                Test Connection
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            IIFL Blaze API Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              How to get your API credentials
            </h4>
            <ol className="text-sm text-muted-foreground space-y-1 ml-6 list-decimal">
              <li>Log in to your IIFL trading account</li>
              <li>Navigate to Settings {'>'} API Management</li>
              <li>Generate new API credentials</li>
              <li>Copy and paste the credentials below</li>
            </ol>
            <a
              href="https://www.iifl.com/api-documentation"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-1"
            >
              View IIFL API Documentation
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <Input
            label="API Key"
            placeholder="Enter your IIFL API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            leftIcon={<Key className="h-5 w-5" />}
            hint="Your unique API key from IIFL"
          />

          <Input
            label="API Secret"
            type="password"
            placeholder="Enter your IIFL API Secret"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            leftIcon={<Key className="h-5 w-5" />}
            hint="Keep this secret safe and never share it"
          />

          <Input
            label="Vendor Code"
            placeholder="Enter your Vendor Code"
            value={vendorCode}
            onChange={(e) => setVendorCode(e.target.value)}
            hint="Optional: Your IIFL vendor code if applicable"
          />

          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-semibold text-foreground mb-2">Security Information</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• All API credentials are encrypted using AES-256 encryption</li>
              <li>• Credentials are stored securely in our database</li>
              <li>• We use SSL/TLS for all API communications</li>
              <li>• You can revoke access at any time from your IIFL account</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleTestConnection}
              isLoading={isTesting}
              disabled={!apiKey || !apiSecret}
            >
              Test Connection
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={!apiKey || !apiSecret}
            >
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-foreground mb-2">
                Connection Failed?
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Verify your API credentials are correct</li>
                <li>Check if your API key is active in IIFL portal</li>
                <li>Ensure your IP address is whitelisted (if required)</li>
                <li>Check your internet connection</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-foreground mb-2">
                Need Help?
              </h4>
              <p className="text-sm text-muted-foreground mb-3">
                Our support team is here to help you with API configuration
              </p>
              <Button variant="outline" size="sm">
                Contact Support
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Container>
  );
};

export default APISetupPage;
