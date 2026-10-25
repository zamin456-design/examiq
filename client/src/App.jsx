import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Guard } from './ui';
import { Landing, Login, Register } from './pages/Public';
import { SDash, SCourses, SCourse, TakeTest, SResults } from './pages/Student';
import { TDash, Command, TCourses, TStudents, Review } from './pages/Teacher';
import { Admin } from './pages/Admin';
export default function App() {
  return (<Routes>
    <Route path="/" element={<Landing />} /><Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />
    <Route path="/student" element={<Guard role="student" />}><Route index element={<SDash />} /><Route path="courses" element={<SCourses />} />
      <Route path="courses/:id" element={<SCourse />} /><Route path="test/:id" element={<TakeTest />} /><Route path="results" element={<SResults />} /></Route>
    <Route path="/teacher" element={<Guard role="teacher" />}><Route index element={<TDash />} /><Route path="command" element={<Command />} />
      <Route path="courses" element={<TCourses />} /><Route path="students" element={<TStudents />} /><Route path="review" element={<Review />} /></Route>
    <Route path="/admin" element={<Guard role="admin" />}><Route index element={<Admin />} /></Route>
    <Route path="*" element={<Navigate to="/" />} />
  </Routes>);
}
