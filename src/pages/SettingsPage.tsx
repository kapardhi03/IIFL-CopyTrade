import React, { useState } from 'react';
import { User, Lock, Bell, Trash2, Save } from 'lucide-react';
import { Button, Input, Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import Container from '../components/layout/Container';
import PageHeader from '../components/layout/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  return (
    <Container className="py-8 max-w-4xl">
      <PageHeader
        title="Settings"
        description="Manage your account settings and preferences"
      />

      <div className="space-y-6">
        {/* Profile Settings */}
        <ProfileSettings />

        {/* Security Settings */}
        <SecuritySettings />

        {/* Notification Preferences */}
        <NotificationPreferences />

        {/* Danger Zone */}
        <DangerZone />
      </div>
    </Container>
  );
};

// Profile Settings Component
const ProfileSettings: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { addToast } = useToast();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });

  const handleSave = () => {
    updateUser(formData);
    addToast({
      type: 'success',
      title: 'Profile Updated',
      message: 'Your profile has been updated successfully',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Profile Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          label="Full Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        <Input
          label="Email Address"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          hint="Email changes require verification"
        />
        <Input
          label="Phone Number"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />

        <div className="flex items-center gap-2 pt-2">
          <span className="text-sm text-muted-foreground">Account Type:</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
            {user?.role} Trader
          </span>
        </div>

        <Button leftIcon={<Save className="h-4 w-4" />} onClick={handleSave}>
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
};

// Security Settings Component
const SecuritySettings: React.FC = () => {
  const { addToast } = useToast();
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  const handleChangePassword = () => {
    if (passwords.new !== passwords.confirm) {
      addToast({
        type: 'error',
        title: 'Password Mismatch',
        message: 'New password and confirmation do not match',
      });
      return;
    }

    addToast({
      type: 'success',
      title: 'Password Changed',
      message: 'Your password has been changed successfully',
    });
    setPasswords({ current: '', new: '', confirm: '' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="font-semibold text-foreground mb-4">Change Password</h4>
          <div className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
            />
            <Input
              label="New Password"
              type="password"
              value={passwords.new}
              onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
            />
            <Button
              variant="outline"
              onClick={handleChangePassword}
              disabled={!passwords.current || !passwords.new || !passwords.confirm}
            >
              Change Password
            </Button>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <h4 className="font-semibold text-foreground mb-2">Two-Factor Authentication</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Add an extra layer of security to your account
          </p>
          <Button variant="outline">Enable 2FA</Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Notification Preferences Component
const NotificationPreferences: React.FC = () => {
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState({
    tradeCopied: true,
    orderCancelled: true,
    followerAdded: true,
    riskBreach: true,
    emailAlerts: true,
    smsAlerts: false,
  });

  const handleSave = () => {
    addToast({
      type: 'success',
      title: 'Preferences Saved',
      message: 'Your notification preferences have been updated',
    });
  };

  const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({
    checked,
    onChange,
  }) => (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Trade Copied</p>
              <p className="text-sm text-muted-foreground">
                Notify when a trade is copied to followers
              </p>
            </div>
            <ToggleSwitch
              checked={notifications.tradeCopied}
              onChange={(checked) => setNotifications({ ...notifications, tradeCopied: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Order Cancelled</p>
              <p className="text-sm text-muted-foreground">
                Notify when an order is cancelled
              </p>
            </div>
            <ToggleSwitch
              checked={notifications.orderCancelled}
              onChange={(checked) =>
                setNotifications({ ...notifications, orderCancelled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Follower Added</p>
              <p className="text-sm text-muted-foreground">
                Notify when a new follower is added
              </p>
            </div>
            <ToggleSwitch
              checked={notifications.followerAdded}
              onChange={(checked) =>
                setNotifications({ ...notifications, followerAdded: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Risk Breach</p>
              <p className="text-sm text-muted-foreground">
                Notify when risk limits are breached
              </p>
            </div>
            <ToggleSwitch
              checked={notifications.riskBreach}
              onChange={(checked) => setNotifications({ ...notifications, riskBreach: checked })}
            />
          </div>
        </div>

        <div className="pt-4 border-t border-border space-y-4">
          <h4 className="font-semibold text-foreground">Alert Channels</h4>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Email Alerts</p>
              <p className="text-sm text-muted-foreground">
                Receive notifications via email
              </p>
            </div>
            <ToggleSwitch
              checked={notifications.emailAlerts}
              onChange={(checked) => setNotifications({ ...notifications, emailAlerts: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">SMS Alerts</p>
              <p className="text-sm text-muted-foreground">
                Receive notifications via SMS
              </p>
            </div>
            <ToggleSwitch
              checked={notifications.smsAlerts}
              onChange={(checked) => setNotifications({ ...notifications, smsAlerts: checked })}
            />
          </div>
        </div>

        <Button leftIcon={<Save className="h-4 w-4" />} onClick={handleSave}>
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
};

// Danger Zone Component
const DangerZone: React.FC = () => {
  const { addToast } = useToast();

  const handleDeleteAccount = () => {
    addToast({
      type: 'error',
      title: 'Account Deletion',
      message: 'Please contact support to delete your account',
    });
  };

  return (
    <Card className="border-loss">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-loss">
          <Trash2 className="h-5 w-5" />
          Danger Zone
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-foreground mb-2">Delete Account</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <Button variant="danger" onClick={handleDeleteAccount}>
              Delete Account
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SettingsPage;
