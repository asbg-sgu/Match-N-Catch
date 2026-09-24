# Tests for Match & Catch Game
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import Event, Player, GameAttempt
from .services import get_or_create_default_event


class PlayerTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.event = get_or_create_default_event()

    def test_register_player(self):
        """Test registering a new player"""
        data = {
            'student_id': 'SV001',
            'display_name': 'Nguyen Van A'
        }
        response = self.client.post('/api/players/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['student_id'], 'SV001')
        self.assertTrue(response.data['can_play'])
        self.assertEqual(response.data['attempts_count'], 0)


class GameFlowTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.event = get_or_create_default_event()
        self.player_data = {
            'student_id': 'SV002',
            'display_name': 'Tran Thi B'
        }

    def test_start_game(self):
        """Test starting a new game"""
        response = self.client.post('/api/game/start/', self.player_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('session_token', response.data)
        self.assertIn('attempt_id', response.data)
        self.assertEqual(len(response.data['round_1_cards']), 20)
        self.assertEqual(len(response.data['round_2_cards']), 20)
        self.assertEqual(len(response.data['bonus_questions']), 2)

    def test_max_attempts_limit(self):
        """Test that player cannot play more than 3 times"""
        # Play 3 times
        for i in range(3):
            response = self.client.post('/api/game/start/', self.player_data, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        # 4th attempt should fail
        response = self.client.post('/api/game/start/', self.player_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class LeaderboardTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.event = get_or_create_default_event()

    def test_get_leaderboard(self):
        """Test fetching leaderboard"""
        response = self.client.get('/api/leaderboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('event_name', response.data)
        self.assertIn('top_entries', response.data)
