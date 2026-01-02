import React, { useState } from 'react';
import { ArrowLeft, User as UserIcon, Mail, Briefcase, Building, Edit2, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface UserProfileProps {
  onBack: () => void;
}

export function UserProfile({ onBack }: UserProfileProps) {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || '',
    organization: user?.organization || '',
  });

  const handleSave = () => {
    updateProfile(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
      role: user?.role || '',
      organization: user?.organization || '',
    });
    setIsEditing(false);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 lg:p-8 pb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-100 hover:text-white mb-4 text-sm lg:text-base">
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1>My Profile</h1>
              <p className="text-blue-100 text-sm">{user.role}</p>
            </div>
          </div>
        </div>

        {/* Profile Content */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-gray-700">Profile Information</h2>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
              >
                <Edit2 className="w-4 h-4" />
                <span className="text-sm">Edit</span>
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>Save</span>
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>

          {/* Profile Fields */}
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                <UserIcon className="w-4 h-4" />
                <span>Full Name</span>
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              ) : (
                <p className="p-3 bg-gray-50 rounded-lg text-gray-900">{user.name}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                <Mail className="w-4 h-4" />
                <span>Email Address</span>
              </label>
              {isEditing ? (
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              ) : (
                <p className="p-3 bg-gray-50 rounded-lg text-gray-900">{user.email}</p>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                <Briefcase className="w-4 h-4" />
                <span>Role</span>
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              ) : (
                <p className="p-3 bg-gray-50 rounded-lg text-gray-900">{user.role}</p>
              )}
            </div>

            {/* Organization */}
            <div>
              <label className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                <Building className="w-4 h-4" />
                <span>Organization</span>
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />
              ) : (
                <p className="p-3 bg-gray-50 rounded-lg text-gray-900">{user.organization}</p>
              )}
            </div>
          </div>

          {/* Account Info */}
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-blue-900 mb-2">Account Information</h3>
            <div className="space-y-1 text-sm text-blue-800">
              <p>User ID: <span className="font-mono">{user.id}</span></p>
              <p>Account Type: Professional</p>
              <p>Member Since: December 2024</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}