# Management command để khởi tạo sự kiện mặc định
from django.core.management.base import BaseCommand
from game.services import get_or_create_default_event


class Command(BaseCommand):
    help = 'Initialize default event for Match & Catch game'

    def handle(self, *args, **options):
        event = get_or_create_default_event()
        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully initialized event: {event.name} (ID: {event.id})'
            )
        )
